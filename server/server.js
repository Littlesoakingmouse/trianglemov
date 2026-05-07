const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the parent directory (so /web, /build, /shaders are accessible)
app.use(express.static(path.join(__dirname, '../')));

// Automatically redirect root URL to the web app
app.get('/', (req, res) => {
    res.redirect('/web/index.html');
});

const rooms = {}; // Structure: { roomCode: { host: socketId, clients: [socketId] } }

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit code
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoom = null;

    socket.on('create_room', (callback) => {
        const code = generateRoomCode();
        rooms[code] = { host: socket.id, clients: [], nextPlayerId: 1 };
        currentRoom = code;
        socket.join(code);
        console.log(`Room created: ${code} by ${socket.id}`);
        callback({ success: true, code: code, isHost: true, playerId: 0 }); // Host is always player 0
    });

    socket.on('join_room', (code, callback) => {
        if (rooms[code]) {
            const playerId = rooms[code].nextPlayerId++;
            rooms[code].clients.push({ socketId: socket.id, playerId: playerId });
            currentRoom = code;
            socket.join(code);
            console.log(`User ${socket.id} joined room ${code} as Player ${playerId}`);
            callback({ success: true, isHost: false, playerId: playerId });
            
            // Notify host that a new player joined
            io.to(rooms[code].host).emit('player_joined', { playerId: playerId });
        } else {
            callback({ success: false, message: "Room not found" });
        }
    });

    // Client sends input (D-pad) to the Host
    socket.on('input_sync', (data) => {
        if (currentRoom && rooms[currentRoom] && rooms[currentRoom].host !== socket.id) {
            // Forward input to the host
            io.to(rooms[currentRoom].host).emit('client_input', { 
                playerId: data.playerId, 
                dx: data.dx, 
                dy: data.dy 
            });
        }
    });

    // Host sends game state (positions) to all Clients
    socket.on('state_sync', (data) => {
        if (currentRoom && rooms[currentRoom] && rooms[currentRoom].host === socket.id) {
            // Forward state to everyone else in the room (except the host)
            socket.to(currentRoom).emit('game_state', data);
        }
    });

    socket.on('request_replay', () => {
        if (currentRoom && rooms[currentRoom]) {
            io.to(rooms[currentRoom].host).emit('do_replay');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (currentRoom && rooms[currentRoom]) {
            if (rooms[currentRoom].host === socket.id) {
                // Host left, destroy room
                socket.to(currentRoom).emit('room_closed');
                delete rooms[currentRoom];
            } else {
                // Client left
                const clientIndex = rooms[currentRoom].clients.findIndex(c => c.socketId === socket.id);
                if (clientIndex !== -1) {
                    const playerId = rooms[currentRoom].clients[clientIndex].playerId;
                    rooms[currentRoom].clients.splice(clientIndex, 1);
                    io.to(rooms[currentRoom].host).emit('player_left', playerId);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Access the game at: http://localhost:${PORT}/web/index.html`);
});

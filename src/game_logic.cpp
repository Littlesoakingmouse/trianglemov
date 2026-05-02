#include "game_logic.h"
#include <cmath>
#include <cstdlib>

float GameLogic::dist(float x1, float y1, float x2, float y2) {
    return std::hypot(x1 - x2, y1 - y2);
}

void GameLogic::getTriPos(float bx, float by, int i, int total, float& tx, float& ty) {
    float rad = (rot + i * (360.0f / total)) * 3.14159f / 180.0f;
    tx = bx + 0.25f * cos(rad); 
    ty = by + 0.25f * sin(rad);
}

void GameLogic::init() {
    rot = 0.0f;
    items.clear();
    enemies.clear();
    players.clear();
    isOver = false;
    isWin = false;
    
    players[localPlayerId] = { 0.0f, 0.0f, 0, true };
    
    if (isHost) {
        for (int i = 0; i < 30; i++) {
            items.push_back({
                (float)(rand() % 400 - 200) / 100.0f,
                (float)(rand() % 400 - 200) / 100.0f,
                true
            });
        }
        for (int i = 0; i < 5; i++) {
            enemies.push_back({
                (float)(rand() % 400 - 200) / 100.0f,
                (float)(rand() % 400 - 200) / 100.0f,
                (rand() % 5) + 3,
                true
            });
        }
    }
}

void GameLogic::reset() {
    init();
}

void GameLogic::update() {
    if (!isHost) return; 
    if (isOver || isWin) return;

    rot += 2.0f;
    if (rot > 360.0f) rot -= 360.0f;

    bool anyEnemyAlive = false;
    for (auto& e : enemies) {
        if (!e.active) continue;
        anyEnemyAlive = true;
        
        float minDist = 9999.0f;
        int targetId = -1;
        for (const auto& pair : players) {
            if (!pair.second.active) continue;
            float d = dist(pair.second.x, pair.second.y, e.x, e.y);
            if (d < minDist) {
                minDist = d;
                targetId = pair.first;
            }
        }
        
        if (targetId != -1) {
            Player& p = players[targetId];
            float pX = p.x;
            float pY = p.y;
            float d = dist(pX, pY, e.x, e.y);
            if (d > 0.1f) { 
                e.x += (pX - e.x) / d * 0.002f; 
                e.y += (pY - e.y) / d * 0.002f; 
            }

            for (int i = 0; i < e.c; i++) {
                float tx, ty; getTriPos(e.x, e.y, i, e.c, tx, ty);
                if (dist(pX, pY, tx, ty) < 0.14f) {
                    p.active = false; 
                }
            }
            
            for (int i = 0; i < p.count; i++) {
                float tx, ty; getTriPos(pX, pY, i, p.count, tx, ty);
                if (dist(e.x, e.y, tx, ty) < 0.12f) { 
                    e.active = false; 
                    break; 
                }
                for (int j = 0; j < e.c; j++) {
                    float ex, ey; getTriPos(e.x, e.y, j, e.c, ex, ey);
                    if (dist(tx, ty, ex, ey) < 0.08f) { 
                        p.count--; 
                        e.c--; 
                        break; 
                    }
                }
            }
        }
    }

    if (!anyEnemyAlive) isWin = true;

    bool anyPlayerAlive = false;
    for (const auto& pair : players) {
        if (pair.second.active) {
            anyPlayerAlive = true; break;
        }
    }
    if (!anyPlayerAlive) isOver = true;

    for (auto& pair : players) {
        Player& p = pair.second;
        if (!p.active) continue;
        for (auto& it : items) {
            if (it.active && dist(p.x, p.y, it.x, it.y) < 0.15f) {
                it.active = false;
                p.count++;
            }
        }
    }
}

int GameLogic::packState() {
    syncBuffer[0] = rot;
    syncBuffer[1] = (float)players.size();
    syncBuffer[2] = (float)items.size();
    syncBuffer[3] = (float)enemies.size();
    syncBuffer[4] = isOver ? 1.0f : 0.0f;
    syncBuffer[5] = isWin ? 1.0f : 0.0f;

    int idx = 6;
    for (auto const& pair : players) {
        syncBuffer[idx++] = (float)pair.first; 
        syncBuffer[idx++] = pair.second.x;
        syncBuffer[idx++] = pair.second.y;
        syncBuffer[idx++] = (float)pair.second.count;
        syncBuffer[idx++] = pair.second.active ? 1.0f : 0.0f;
    }
    for (auto const& it : items) {
        syncBuffer[idx++] = it.x;
        syncBuffer[idx++] = it.y;
        syncBuffer[idx++] = it.active ? 1.0f : 0.0f;
    }
    for (auto const& e : enemies) {
        syncBuffer[idx++] = e.x;
        syncBuffer[idx++] = e.y;
        syncBuffer[idx++] = (float)e.c;
        syncBuffer[idx++] = e.active ? 1.0f : 0.0f;
    }
    return idx; 
}

void GameLogic::unpackState() {
    rot = syncBuffer[0];
    int numPlayers = (int)syncBuffer[1];
    int numItems = (int)syncBuffer[2];
    int numEnemies = (int)syncBuffer[3];
    isOver = syncBuffer[4] > 0.5f;
    isWin = syncBuffer[5] > 0.5f;

    int idx = 6;
    players.clear();
    for (int i = 0; i < numPlayers; i++) {
        int id = (int)syncBuffer[idx++];
        players[id] = {
            syncBuffer[idx++], 
            syncBuffer[idx++], 
            (int)syncBuffer[idx++], 
            syncBuffer[idx++] > 0.5f 
        };
    }

    items.clear();
    for (int i = 0; i < numItems; i++) {
        items.push_back({
            syncBuffer[idx++],
            syncBuffer[idx++],
            syncBuffer[idx++] > 0.5f
        });
    }

    enemies.clear();
    for (int i = 0; i < numEnemies; i++) {
        enemies.push_back({
            syncBuffer[idx++],
            syncBuffer[idx++],
            (int)syncBuffer[idx++],
            syncBuffer[idx++] > 0.5f
        });
    }
}

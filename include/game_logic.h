#pragma once
#include <vector>
#include <map>

struct Item {
    float x, y;
    bool active;
};

struct Enemy {
    float x, y;
    int c;
    bool active;
};

struct Player {
    float x, y;
    int count;
    bool active;
};

class GameLogic {
public:
    void init();
    void update();
    void reset();

    std::map<int, Player> players;
    float rot;
    std::vector<Item> items;
    std::vector<Enemy> enemies;
    
    bool isOver = false;
    bool isWin = false;

    bool isHost = true;
    int localPlayerId = 0;

    float syncBuffer[256];
    int packState();
    void unpackState();

private:
    float dist(float x1, float y1, float x2, float y2);
    void getTriPos(float bx, float by, int i, int total, float& tx, float& ty);
};

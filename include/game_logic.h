#pragma once
#include <vector>

struct Obj { 
    float x, y; 
    int c; 
    bool active; 
};

class GameLogic {
public:
    // Game state
    float pX = 0, pY = 0, pZ = -2.0f; // Positioned slightly in front of the camera in WebXR
    float rot = 0;
    int pCount = 0;
    bool isOver = false;
    bool isWin = false;

    std::vector<Obj> items;
    std::vector<Obj> enemies;

    void init();
    void update();
};

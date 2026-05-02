#include "game_logic.h"
#include <cmath>
#include <cstdlib>
#include <ctime>

float dist(float x1, float y1, float x2, float y2) { 
    return std::hypot(x1 - x2, y1 - y2); 
}

void getTriPos(float rot, float bx, float by, int i, int total, float& tx, float& ty) {
    float rad = (rot + i * (360.0f / total)) * 3.14159f / 180.0f;
    tx = bx + 0.25f * cos(rad); 
    ty = by + 0.25f * sin(rad);
}

void GameLogic::init() {
    std::srand(std::time(NULL));
    items.clear(); 
    enemies.clear();
    
    pX = 0; pY = 0; rot = 0; pCount = 0;
    isOver = false; isWin = false;

    for (int i = 0; i < 30; i++) {
        items.push_back({ ((std::rand() % 400) / 100.0f) - 2.0f, ((std::rand() % 400) / 100.0f) - 2.0f, 0, true });
    }
    for (int i = 0; i < 5; i++) {
        enemies.push_back({ ((std::rand() % 400) / 100.0f) - 2.0f, ((std::rand() % 400) / 100.0f) - 2.0f, (std::rand() % 5) + 3, true });
    }
}

void GameLogic::update() {
    if (isOver || isWin) return;

    // We removed GLFW keys. In AR, you move your phone to walk around (the camera matrix changes). 
    // You could also add tap-to-move logic here later by reading touch inputs from JavaScript.

    rot += 2; 
    if (rot > 360) rot -= 360;

    bool anyEnemyAlive = false;
    for (auto& e : enemies) {
        if (!e.active) continue;
        anyEnemyAlive = true;
        
        float d = dist(pX, pY, e.x, e.y);
        if (d > 0.1f) { 
            e.x += (pX - e.x) / d * 0.002f; 
            e.y += (pY - e.y) / d * 0.002f; 
        }

        for (int i = 0; i < e.c; i++) {
            float tx, ty; 
            getTriPos(rot, e.x, e.y, i, e.c, tx, ty);
            if (dist(pX, pY, tx, ty) < 0.14f) isOver = true;
        }
        for (int i = 0; i < pCount; i++) {
            float tx, ty; 
            getTriPos(rot, pX, pY, i, pCount, tx, ty);
            if (dist(e.x, e.y, tx, ty) < 0.12f) { e.active = false; break; }
            for (int j = 0; j < e.c; j++) {
                float ex, ey; 
                getTriPos(rot, e.x, e.y, j, e.c, ex, ey);
                if (dist(tx, ty, ex, ey) < 0.08f) { pCount--; e.c--; break; }
            }
        }
    }

    if (!anyEnemyAlive) isWin = true;

    for (auto& it : items) {
        if (it.active && dist(pX, pY, it.x, it.y) < 0.15f) { 
            it.active = false; 
            pCount++; 
        }
    }
}

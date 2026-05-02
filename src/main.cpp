#include <GLES3/gl3.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <iostream>

#include "game_logic.h"
#include "renderer.h"

GameLogic gameLogic;
Renderer gameRenderer;

int main() {
    std::cout << "Initializing WebAR C++ WASM module..." << std::endl;

    EmscriptenWebGLContextAttributes attr;
    emscripten_webgl_init_context_attributes(&attr);
    attr.alpha = EM_TRUE;
    attr.depth = EM_TRUE;
    attr.antialias = EM_TRUE;
    attr.majorVersion = 2;
    attr.minorVersion = 0;

    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = emscripten_webgl_create_context("#canvas", &attr);
    if (ctx <= 0) {
        std::cerr << "Failed to create WebGL context!" << std::endl;
        return 1;
    }
    emscripten_webgl_make_context_current(ctx);

    std::cout << "WebGL 2 context created successfully." << std::endl;

    gameLogic.init();
    gameRenderer.init();
    
    return 0;
}

// Receive the hit_matrix and is_placed boolean from Javascript
extern "C" {
    EMSCRIPTEN_KEEPALIVE
    void move_player(float dx, float dy) {
        gameLogic.pX += dx;
        gameLogic.pY += dy;
    }

    EMSCRIPTEN_KEEPALIVE
    void render_frame(float* view_matrix, float* projection_matrix, float* hit_matrix, int is_placed) {
        glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        gameRenderer.set_matrices(view_matrix, projection_matrix, hit_matrix, is_placed);
        
        // Only update logic if the game is actually placed on a physical table
        if (is_placed) {
            gameLogic.update();
        }
        
        gameRenderer.draw(gameLogic);
    }
}

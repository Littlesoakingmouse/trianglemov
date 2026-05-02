cmake_minimum_required(VERSION 3.15)
project(WebAR_Game)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED True)

# Include directories
include_directories(include)

# Define source files
set(SOURCES
    src/main.cpp
    src/game_logic.cpp
    src/renderer.cpp
)

# Add the main executable
add_executable(game ${SOURCES})

# Emscripten-specific configurations
if(EMSCRIPTEN)
    # Output to .js so that Emscripten generates game.js and game.wasm
    set_target_properties(game PROPERTIES SUFFIX ".js")

    # Linker flags for WebGL 2.0, Memory growth, and exporting C++ functions to JS
    # _malloc and _free are exported so JS can allocate memory for passing matrices
    set_target_properties(game PROPERTIES LINK_FLAGS
    "-s USE_WEBGL2=1 -s MIN_WEBGL_VERSION=2 -s MAX_WEBGL_VERSION=2 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32'] -s EXPORTED_FUNCTIONS=['_main','_malloc','_free','_render_frame'] -s NO_EXIT_RUNTIME=1"
)
endif()

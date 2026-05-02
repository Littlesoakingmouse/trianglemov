#pragma once
#include <GLES3/gl3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include "game_logic.h"

class Renderer {
private:
    GLuint shaderProgram;
    GLuint vao_tri, vbo_tri;
    GLuint vao_quad, vbo_quad;
    GLuint vao_poly, vbo_poly;
    GLuint vao_line, vbo_line;

    GLint modelLoc, viewLoc, projLoc, colorLoc;

    void compileShaders();
    void setupBuffers();
    void setMatrixAndColor(const glm::mat4& model, const glm::vec3& color);

    void drawTri();
    void drawNumber(const glm::mat4& baseModel, int num, float x, float y);
    void drawOrbit(const glm::mat4& baseModel, float x, float y, int count, float rot);

public:
    void init();
    void set_matrices(float* view_matrix, float* projection_matrix, float* hit_matrix, int placed);
    void draw(const GameLogic& logic);

    glm::mat4 view;
    glm::mat4 projection;
    glm::mat4 hitMatrix;
    int isPlaced;
};

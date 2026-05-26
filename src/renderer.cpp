#include "renderer.h"
#include <iostream>
#include <string>
#include <vector>

const char* vertexShaderSource = R"(#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 u_Model;
uniform mat4 u_View;
uniform mat4 u_Projection;
void main() {
    gl_Position = u_Projection * u_View * u_Model * vec4(aPos, 1.0);
}
)";

const char* fragmentShaderSource = R"(#version 300 es
precision mediump float;
uniform vec3 u_Color;
out vec4 FragColor;
void main() {
    FragColor = vec4(u_Color, 1.0);
}
)";

static glm::mat4 manualTranslate(float dx, float dy) {
    glm::mat4 m(1.0f);
    m[3][0] = dx;
    m[3][1] = dy;
    return m;
}

static glm::mat4 manualRotateZ(float angle_degree) {
    float rad = angle_degree * 3.14159f / 180.0f;
    float c = std::cos(rad);
    float s = std::sin(rad);
    glm::mat4 m(1.0f);
    m[0][0] = c;  m[0][1] = s;
    m[1][0] = -s; m[1][1] = c;
    return m;
}

void Renderer::compileShaders() {
    GLuint vertexShader = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vertexShader, 1, &vertexShaderSource, NULL);
    glCompileShader(vertexShader);

    GLuint fragmentShader = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fragmentShader, 1, &fragmentShaderSource, NULL);
    glCompileShader(fragmentShader);

    shaderProgram = glCreateProgram();
    glAttachShader(shaderProgram, vertexShader);
    glAttachShader(shaderProgram, fragmentShader);
    glLinkProgram(shaderProgram);

    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);

    modelLoc = glGetUniformLocation(shaderProgram, "u_Model");
    viewLoc = glGetUniformLocation(shaderProgram, "u_View");
    projLoc = glGetUniformLocation(shaderProgram, "u_Projection");
    colorLoc = glGetUniformLocation(shaderProgram, "u_Color");
}

void Renderer::setupBuffers() {
    float triVertices[] = { 0.0f, 0.04f, 0.0f, -0.04f, -0.04f, 0.0f, 0.04f, -0.04f, 0.0f };
    glGenVertexArrays(1, &vao_tri); glGenBuffers(1, &vbo_tri);
    glBindVertexArray(vao_tri); glBindBuffer(GL_ARRAY_BUFFER, vbo_tri);
    glBufferData(GL_ARRAY_BUFFER, sizeof(triVertices), triVertices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    float quadVertices[] = { -0.08f, -0.08f, 0.0f, 0.08f, -0.08f, 0.0f, 0.08f, 0.08f, 0.0f, -0.08f, -0.08f, 0.0f, 0.08f, 0.08f, 0.0f, -0.08f, 0.08f, 0.0f };
    glGenVertexArrays(1, &vao_quad); glGenBuffers(1, &vbo_quad);
    glBindVertexArray(vao_quad); glBindBuffer(GL_ARRAY_BUFFER, vbo_quad);
    glBufferData(GL_ARRAY_BUFFER, sizeof(quadVertices), quadVertices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    float polyVertices[32 * 3];
    polyVertices[0] = 0.0f; polyVertices[1] = 0.0f; polyVertices[2] = 0.0f;
    for (int i = 0; i <= 30; i++) {
        polyVertices[(i+1)*3 + 0] = 0.1f * std::cos(i * 2 * 3.14159f / 30);
        polyVertices[(i+1)*3 + 1] = 0.1f * std::sin(i * 2 * 3.14159f / 30);
        polyVertices[(i+1)*3 + 2] = 0.0f;
    }
    glGenVertexArrays(1, &vao_poly); glGenBuffers(1, &vbo_poly);
    glBindVertexArray(vao_poly); glBindBuffer(GL_ARRAY_BUFFER, vbo_poly);
    glBufferData(GL_ARRAY_BUFFER, sizeof(polyVertices), polyVertices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    glGenVertexArrays(1, &vao_line); glGenBuffers(1, &vbo_line);
}

void Renderer::init() {
    compileShaders();
    setupBuffers();
}

void Renderer::set_matrices(float* view_matrix, float* projection_matrix, float* hit_matrix, int placed) {
    view = glm::make_mat4(view_matrix);
    projection = glm::make_mat4(projection_matrix);
    hitMatrix = glm::make_mat4(hit_matrix);
    isPlaced = placed;
}

void Renderer::setMatrixAndColor(const glm::mat4& model, const glm::vec3& color) {
    glUniformMatrix4fv(modelLoc, 1, GL_FALSE, glm::value_ptr(model));
    glUniform3fv(colorLoc, 1, glm::value_ptr(color));
}

void Renderer::drawTri() {
    glBindVertexArray(vao_tri);
    glDrawArrays(GL_TRIANGLES, 0, 3);
}

void Renderer::drawNumber(const glm::mat4& baseModel, int num, float x, float y) {
    int segs[10][7] = {
        {1,1,1,1,1,1,0}, {0,1,1,0,0,0,0}, {1,1,0,1,1,0,1}, {1,1,1,1,0,0,1},
        {0,1,1,0,0,1,1}, {1,0,1,1,0,1,1}, {1,0,1,1,1,1,1}, {1,1,1,0,0,0,0},
        {1,1,1,1,1,1,1}, {1,1,1,1,0,1,1}
    };
    std::string s = std::to_string(num);
    float startX = x - (s.length() - 1) * 0.02f;
    float w = 0.015f, h = 0.03f;
    
    glBindVertexArray(vao_line); glBindBuffer(GL_ARRAY_BUFFER, vbo_line);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    for (char c : s) {
        int d = c - '0';
        if (d < 0 || d > 9) continue;
        std::vector<float> lines;
        auto addLine = [&](float x1, float y1, float x2, float y2) {
            lines.push_back(x1); lines.push_back(y1); lines.push_back(0.0f);
            lines.push_back(x2); lines.push_back(y2); lines.push_back(0.0f);
        };
        if (segs[d][0]) addLine(-w, h, w, h); if (segs[d][1]) addLine(w, h, w, 0);
        if (segs[d][2]) addLine(w, 0, w, -h); if (segs[d][3]) addLine(w, -h, -w, -h);
        if (segs[d][4]) addLine(-w, -h, -w, 0); if (segs[d][5]) addLine(-w, 0, -w, h);
        if (segs[d][6]) addLine(-w, 0, w, 0);

        glm::mat4 model = glm::translate(baseModel, glm::vec3(startX, y, 0.0f));
        setMatrixAndColor(model, glm::vec3(1.0f, 1.0f, 1.0f));
        glBufferData(GL_ARRAY_BUFFER, lines.size() * sizeof(float), lines.data(), GL_DYNAMIC_DRAW);
        glDrawArrays(GL_LINES, 0, lines.size() / 3);
        startX += 0.04f;
    }
}

void Renderer::drawOrbit(const glm::mat4& baseModel, float x, float y, int count, float rot) {
    if (count <= 0) return;
    for (int i = 0; i < count; i++) {
        float angle = rot + (i * 360.0f / count);

        // Định dạng tam giác hướng ra ngoài
        glm::mat4 r_shape = manualRotateZ(-90.0f);
        
        // Đặt tam giác ở vị trí tuyệt đối cách tâm (x,y) một khoảng 0.25 theo trục X
        glm::mat4 t_pos = manualTranslate(x + 0.25f, y);

        // --- BÀI TẬP: Thực hiện phép quay quanh điểm (x,y) thủ công ---
        // B1. Tịnh tiến điểm về gốc tọa độ
        glm::mat4 t_to_origin = manualTranslate(-x, -y);
        
        // B2. Thực hiện quay
        glm::mat4 r_rot = manualRotateZ(angle);
        
        // B3. Tịnh tiến lại về điểm ban đầu
        glm::mat4 t_back = manualTranslate(x, y);

        // Nhân các ma trận (thứ tự từ phải sang trái đối với vector)
        glm::mat4 model = baseModel * t_back * r_rot * t_to_origin * t_pos * r_shape;

        setMatrixAndColor(model, glm::vec3(1.0f, 0.0f, 0.0f));
        drawTri();
    }
}

void Renderer::draw(const GameLogic& logic) {
    glUseProgram(shaderProgram);
    glUniformMatrix4fv(viewLoc, 1, GL_FALSE, glm::value_ptr(view));
    glUniformMatrix4fv(projLoc, 1, GL_FALSE, glm::value_ptr(projection));

    glDisable(GL_DEPTH_TEST);

    if (logic.isOver) {
        glClearColor(0.5f, 0.0f, 0.0f, 0.5f);
        glClear(GL_COLOR_BUFFER_BIT);
        return;
    }
    if (logic.isWin) {
        glClearColor(0.0f, 0.5f, 0.0f, 0.5f);
        glClear(GL_COLOR_BUFFER_BIT);
        return;
    }

    // Step 1: Handle Hit Testing & Placement state
    if (!isPlaced) {
        if (hitMatrix[3][3] != 0.0f) {
            glm::mat4 reticleModel = hitMatrix;
            reticleModel = glm::rotate(reticleModel, glm::radians(-90.0f), glm::vec3(1.0f, 0.0f, 0.0f));
            reticleModel = glm::scale(reticleModel, glm::vec3(0.5f, 0.5f, 0.5f));
            setMatrixAndColor(reticleModel, glm::vec3(0.0f, 1.0f, 0.0f));
            
            glBindVertexArray(vao_quad);
            glDrawArrays(GL_TRIANGLES, 0, 6);
        }
        return; 
    }

    // Step 2: Game is placed
    glm::mat4 baseWorld = hitMatrix;
    baseWorld = glm::rotate(baseWorld, glm::radians(-90.0f), glm::vec3(1.0f, 0.0f, 0.0f));
    baseWorld = glm::scale(baseWorld, glm::vec3(0.2f, 0.2f, 0.2f));

    // Draw Items
    for (const auto& it : logic.items) {
        if (!it.active) continue;
        // Thực hiện quay quanh điểm của chính item
        glm::mat4 t_back = manualTranslate(it.x, it.y);
        glm::mat4 r_rot = manualRotateZ(logic.rot * 0.5f);
        glm::mat4 model = baseWorld * t_back * r_rot;
        
        setMatrixAndColor(model, glm::vec3(1.0f, 0.0f, 0.0f)); // Red triangle
        drawTri();
    }

    // Draw Enemies
    for (const auto& e : logic.enemies) {
        if (!e.active) continue;
        glm::mat4 model = baseWorld * manualTranslate(e.x, e.y);
        setMatrixAndColor(model, glm::vec3(0.8f, 0.2f, 0.8f)); // Purple square
        glBindVertexArray(vao_quad);
        glDrawArrays(GL_TRIANGLES, 0, 6);

        drawNumber(baseWorld, e.c, e.x, e.y);
        drawOrbit(baseWorld, e.x, e.y, e.c, logic.rot);
    }

    // Draw all players
    for (const auto& pair : logic.players) {
        if (!pair.second.active) continue;
        const Player& p = pair.second;
        
        glm::mat4 pModel = baseWorld * manualTranslate(p.x, p.y);
        
        // Colors: Local player is blue, Remote players are orange
        glm::vec3 pColor = (pair.first == logic.localPlayerId) ? glm::vec3(0.2f, 0.6f, 1.0f) : glm::vec3(1.0f, 0.6f, 0.2f);
        setMatrixAndColor(pModel, pColor);
        
        glBindVertexArray(vao_poly);
        glDrawArrays(GL_TRIANGLE_FAN, 0, 32);

        drawNumber(baseWorld, p.count, p.x, p.y);
        drawOrbit(baseWorld, p.x, p.y, p.count, logic.rot);
    }
}

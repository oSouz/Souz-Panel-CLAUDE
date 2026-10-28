cmake_minimum_required(VERSION 3.20)
project(BackgroundGen LANGUAGES CXX)

# ---------------------------------------------------------------------------
#  Windows x64 FFGL plugin (.dll) for Resolume - built against the Resolume
#  FFGL SDK (https://github.com/resolume/ffgl). Mirrors the SDK's own
#  Visual Studio projects: SDK sources compiled straight into the DLL,
#  static GLEW shipped in the SDK's deps folder, plugMain exported.
#
#    git clone https://github.com/resolume/ffgl.git ffgl-sdk
#    git -C ffgl-sdk checkout 5b6e07840277df9ec35a228b9eb067636316350f
#    cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DFFGL_ROOT=%CD%\ffgl-sdk
#    cmake --build build --config Release
#
#  Result: build/Release/BackgroundGen.dll
# ---------------------------------------------------------------------------

set(FFGL_ROOT "" CACHE PATH "Path to a checkout of github.com/resolume/ffgl")
if(NOT FFGL_ROOT OR NOT EXISTS "${FFGL_ROOT}/source/lib/ffgl/FFGL.cpp")
    message(FATAL_ERROR
        "FFGL_ROOT is not set or does not point to the Resolume FFGL SDK.\n"
        "  git clone https://github.com/resolume/ffgl.git ffgl-sdk\n"
        "  cmake -S . -B build -A x64 -DFFGL_ROOT=<path to ffgl-sdk>")
endif()
if(NOT WIN32)
    message(WARNING "This project targets the Windows build of Resolume. On other systems it is only useful as a compile check.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

file(GLOB SDK_SOURCES CONFIGURE_DEPENDS
    "${FFGL_ROOT}/source/lib/ffgl/*.cpp"
    "${FFGL_ROOT}/source/lib/ffglex/*.cpp"
    "${FFGL_ROOT}/source/lib/ffglquickstart/*.cpp")

add_library(BackgroundGen SHARED
    ${SDK_SOURCES}
    src/PanelServer.cpp
    src/PanelServer.h
    src/PanelPage.h
    src/BackgroundGen.cpp
    src/BackgroundGen.h
    src/ShaderSource.h
    src/ParamsGenerated.inc)

target_include_directories(BackgroundGen PRIVATE
    src
    "${FFGL_ROOT}/source/lib"
    "${FFGL_ROOT}/deps/glew-2.1.0/include")

target_compile_definitions(BackgroundGen PRIVATE
    GLEW_STATIC WIN32 _WINDOWS _USRDLL _CRT_SECURE_NO_WARNINGS)

if(MSVC)
    target_compile_options(BackgroundGen PRIVATE /MP /W3 /utf-8)
    target_link_options(BackgroundGen PRIVATE "/DEF:${FFGL_ROOT}/build/windows/FFGLPlugins.def")
    target_link_libraries(BackgroundGen PRIVATE
        "${FFGL_ROOT}/deps/glew-2.1.0/lib/Release/x64/glew32s.lib"
        opengl32 ws2_32 shell32 ole32 iphlpapi bcrypt)
endif()

set_target_properties(BackgroundGen PROPERTIES
    OUTPUT_NAME "BackgroundGen"
    PREFIX "")

# Standalone real HTTP tests, no GL context required.
include(CTest)
if(BUILD_TESTING)
    add_executable(panel_harness tests/panel_harness.cpp src/PanelServer.cpp)
    target_include_directories(panel_harness PRIVATE src)
    if(MSVC)
        target_compile_options(panel_harness PRIVATE /utf-8 /W4)
    endif()
    if(WIN32)
        target_link_libraries(panel_harness PRIVATE ws2_32 shell32 ole32 iphlpapi bcrypt)
    else()
        target_link_libraries(panel_harness PRIVATE pthread)
    endif()
    find_package(Python3 COMPONENTS Interpreter REQUIRED)
    add_test(NAME panel_http COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_panel.py" $<TARGET_FILE:panel_harness>)
endif()

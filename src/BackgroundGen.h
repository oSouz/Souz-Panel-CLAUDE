#pragma once
#include <FFGLSDK.h>
#include <memory>
#include "PanelServer.h"

/// Animated background generator (FFGL 2.x source plugin for Resolume).
///
/// Web panel: per-instance HTTP worker, embedded UI, atomic per-parameter handoff.
/// All the visual work happens in one fragment shader (see shader/*.glsl, assembled by
/// tools/gen_shader.py into ShaderSource.h). The visual C++ side:
///   * registers the parameters (ParamsGenerated.inc, same generator -> always in sync),
///   * integrates "animated time" so the Speed slider changes speed smoothly
///     (multiplying the wall clock by Speed would make the animation jump) and Reverse works.
class BackgroundGen : public ffglqs::Source
{
public:
	BackgroundGen();
	~BackgroundGen();

	void Update() override;
    FFResult Init() override;
    void Clean() override;
    FFResult ProcessOpenGL(ProcessOpenGLStruct* input) override;
    FFResult SetFloatParameter(unsigned int index, float value) override;
    float GetFloatParameter(unsigned int index) override;
    char* GetParameterDisplay(unsigned int index) override;

private:
	std::shared_ptr< ffglqs::Param > speedParam;
	std::shared_ptr< ffglqs::Param > reverseParam;
	souz::ParamBank bank;                       // one atomic slot per host parameter
    std::unique_ptr<souz::PanelServer> panel;   // declared after bank: destroyed first
    unsigned int speedIndex = 0, openIndex = 0;
    uint64_t applied[souz::ParamBank::Count]{};
    char speedDisplay[32]{};
    // Called only by the host thread, before the base framework uploads uniforms.
    void ApplyPanelParams();

    double animTime = 0.0;
};

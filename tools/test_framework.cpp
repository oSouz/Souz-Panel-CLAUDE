// Host-side sanity test (Linux, no GL context needed).
// Builds the real plugin class against the real FFGL SDK, then dumps
//   * the parameter table as the host would see it, and
//   * the exact fragment shader the framework would hand to the GL driver.
// Used by tools/run_framework_test.sh to cross-check the generated shader/params.
#include "../src/BackgroundGen.h"
#include <cstdio>
#include <fstream>

struct Probe : public BackgroundGen
{
	std::string FullShader()
	{
		return CreateFragmentShader( fragmentShaderBase );
	}
	size_t ParamCount() const
	{
		return params.size();
	}
	std::string Describe( size_t i )
	{
		auto p = params[ i ];
		char buf[256];
		std::snprintf( buf, sizeof buf, "%2zu  %-18s type=%u default=%.3f", i, p->GetName().c_str(), (unsigned)p->GetType(), p->GetValue() );
		return buf;
	}
};

int main( int argc, char** argv )
{
	Probe probe;
	for( size_t i = 0; i < probe.ParamCount(); ++i )
		std::printf( "%s\n", probe.Describe( i ).c_str() );

	if( argc > 1 )
	{
		std::ofstream f( argv[ 1 ], std::ios::binary );
		f << probe.FullShader();
		std::printf( "wrote %s\n", argv[ 1 ] );
	}
	return 0;
}

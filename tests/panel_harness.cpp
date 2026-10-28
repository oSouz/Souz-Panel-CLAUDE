#include "PanelServer.h"
#include <chrono>
#include <iostream>
#include <cmath>
#include <vector>
#include <stdexcept>
using namespace souz;
void require(bool v){if(!v)throw std::runtime_error("state/lifecycle test failed");}
int main(){
    ParamBank a,b;
    // Defaults come from the generated table; 34 slots follow the host's indices.
    require(ParamBank::Count==34);
    require(std::abs(a.Value(7u)-.35f)<.0001f && a.Value(2u)==1.0f && a.Value(18u)>.61f);
    a.Set(7,.7f,true);require(ParamBank::FromWeb(a.Snapshot(7)));
    a.Set(7,.2f,false);require(!ParamBank::FromWeb(a.Snapshot(7)));
    a.Set(7,.35f,false);
    auto one=std::make_unique<PanelServer>(a);
    auto two=std::make_unique<PanelServer>(b);
    for(int i=0;i<500&&(!one->Port()||!two->Port());++i)std::this_thread::sleep_for(std::chrono::milliseconds(10));
    require(one->Port()&&two->Port()&&one->Port()!=two->Port());
    std::cout<<one->Port()<<" "<<one->Token()<<" "<<two->Port()<<" "<<two->Token()<<std::endl;
    std::string command;
    while(std::cin>>command){
        if(command=="host"){unsigned i;float value;std::cin>>i>>value;a.Set(i,value,false);std::cout<<"ok"<<std::endl;}
        // Reports the last value/origin the "host" side would see for a slot.
        if(command=="peek"){unsigned i;std::cin>>i;auto s=a.Snapshot(i);std::cout<<ParamBank::Decode(s)<<" "<<ParamBank::FromWeb(s)<<std::endl;}
        if(command=="stop1"){one.reset();std::cout<<"stopped"<<std::endl;}
        if(command=="quit")break;
    }
    one.reset();two.reset();
    // Repeated create/stop, including stop during asynchronous initialization.
    for(int i=0;i<20;++i){PanelServer rapid(a);}
}

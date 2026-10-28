#include "PanelServer.h"
#include <chrono>
#include <iostream>
#include <cmath>
#include <vector>
#include <stdexcept>
using namespace souz;
void require(bool v){if(!v)throw std::runtime_error("state/lifecycle test failed");}
int main(){
    SpeedState a,b;
    require(std::abs(SpeedState::Value(a.Snapshot())-.35f)<.0001f);
    a.Set(.7f,true);require(SpeedState::FromWeb(a.Snapshot()));
    a.Set(.2f,false);require(!SpeedState::FromWeb(a.Snapshot()));
    a.Set(.35f,false);
    auto one=std::make_unique<PanelServer>(a);
    auto two=std::make_unique<PanelServer>(b);
    for(int i=0;i<500&&(!one->Port()||!two->Port());++i)std::this_thread::sleep_for(std::chrono::milliseconds(10));
    require(one->Port()&&two->Port()&&one->Port()!=two->Port());
    std::cout<<one->Port()<<" "<<one->Token()<<" "<<two->Port()<<" "<<two->Token()<<std::endl;
    std::string command;
    while(std::cin>>command){
        if(command=="host"){float value;std::cin>>value;a.Set(value,false);std::cout<<"ok"<<std::endl;}
        if(command=="stop1"){one.reset();std::cout<<"stopped"<<std::endl;}
        if(command=="quit")break;
    }
    one.reset();two.reset();
    // Repeated create/stop, including stop during asynchronous initialization.
    for(int i=0;i<20;++i){PanelServer rapid(a);}
}

#include "PanelServer.h"
#include "PanelPage.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cctype>
#include <iomanip>
#include <locale>
#include <map>
#include <random>
#include <sstream>
#include <stdexcept>
#include <vector>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <iphlpapi.h>
#include <bcrypt.h>
#else
#include <arpa/inet.h>
#include <fcntl.h>
#include <ifaddrs.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cerrno>
#endif

namespace souz {
namespace {
#ifdef _WIN32
using Socket = SOCKET;
constexpr Socket invalid = INVALID_SOCKET;
void closeSocket(Socket s) { closesocket(s); }
bool wouldBlock() { return WSAGetLastError() == WSAEWOULDBLOCK; }
void nonblock(Socket s) { u_long v=1; if(ioctlsocket(s,FIONBIO,&v)) throw std::runtime_error("nonblocking"); }
struct Network { Network(){ WSADATA d; if(WSAStartup(MAKEWORD(2,2),&d)) throw std::runtime_error("WSAStartup"); } ~Network(){WSACleanup();} };
#else
using Socket = int;
constexpr Socket invalid = -1;
void closeSocket(Socket s) { close(s); }
bool wouldBlock() { return errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR; }
void nonblock(Socket s) { if(fcntl(s,F_SETFL,O_NONBLOCK)<0) throw std::runtime_error("nonblocking"); }
struct Network {};
#endif
struct Handle {
    Socket s = invalid;
    explicit Handle(Socket socket = invalid):s(socket){}
    ~Handle(){ if(s!=invalid) closeSocket(s); }
    Handle(const Handle&)=delete;
    Handle& operator=(const Handle&)=delete;
};
std::string makeToken() {
    std::array<unsigned char,24> bytes{};
#ifdef _WIN32
    if(BCryptGenRandom(nullptr,bytes.data(),ULONG(bytes.size()),BCRYPT_USE_SYSTEM_PREFERRED_RNG)!=0)
        throw std::runtime_error("random token");
#else
    std::random_device random; for(auto& b:bytes) b=static_cast<unsigned char>(random());
#endif
    std::ostringstream s; for(auto b:bytes) s<<std::hex<<std::setw(2)<<std::setfill('0')<<unsigned(b);
    return s.str();
}
std::vector<std::string> addresses() {
    std::vector<std::string> result{"127.0.0.1"};
    auto add=[&](sockaddr* addr){
        if(!addr || addr->sa_family!=AF_INET) return;
        char buf[INET_ADDRSTRLEN]{};
        auto* ip=&reinterpret_cast<sockaddr_in*>(addr)->sin_addr;
        if(inet_ntop(AF_INET,ip,buf,sizeof buf) && std::string(buf)!="0.0.0.0" &&
           std::find(result.begin(),result.end(),buf)==result.end()) result.emplace_back(buf);
    };
#ifdef _WIN32
    ULONG size=15000; std::vector<unsigned char> buffer(size);
    ULONG error=ERROR_BUFFER_OVERFLOW;
    for(int i=0;i<3 && error==ERROR_BUFFER_OVERFLOW;++i){
        buffer.resize(size);
        error=GetAdaptersAddresses(AF_INET,GAA_FLAG_SKIP_ANYCAST|GAA_FLAG_SKIP_MULTICAST|GAA_FLAG_SKIP_DNS_SERVER,
            nullptr,reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buffer.data()),&size);
    }
    if(error==NO_ERROR) for(auto* a=reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buffer.data());a;a=a->Next)
        if(a->OperStatus==IfOperStatusUp) for(auto* u=a->FirstUnicastAddress;u;u=u->Next) add(u->Address.lpSockaddr);
#else
    ifaddrs* list=nullptr;
    if(getifaddrs(&list)==0){for(auto* a=list;a;a=a->ifa_next) add(a->ifa_addr);freeifaddrs(list);}
#endif
    return result;
}
std::string response(int code,const std::string& body,const char* type="application/json; charset=utf-8"){
    const char* reason=code==200?"OK":code==403?"Forbidden":code==404?"Not Found":"Bad Request";
    return "HTTP/1.1 "+std::to_string(code)+" "+reason+"\r\nContent-Type: "+type+
        "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'\r\nContent-Length: "+std::to_string(body.size())+"\r\n\r\n"+body;
}
const std::string bad = "{\"error\":\"invalid request\"}";
// Empty result means more request bytes are needed. No chunked, pipelined,
// unbounded body, filesystem paths, CORS or arbitrary command execution.
std::string route(const std::string& request,const std::string& token,SpeedState& speed,unsigned short port){
    auto end=request.find("\r\n\r\n");
    if(end==std::string::npos) return request.size()>8192?response(400,bad):"";
    if(end>8192) return response(400,bad);
    std::istringstream lines(request.substr(0,end)); std::string method,path,version,line;
    if(!std::getline(lines,line)) return response(400,bad);
    std::istringstream first(line); std::string extra;
    if(!(first>>method>>path>>version)||first>>extra||version!="HTTP/1.1") return response(400,bad);
    std::map<std::string,std::string> headers;
    while(std::getline(lines,line)){
        if(!line.empty()&&line.back()=='\r') line.pop_back();
        auto colon=line.find(':'); if(colon==std::string::npos) return response(400,bad);
        auto name=line.substr(0,colon),v=line.substr(colon+1);
        std::transform(name.begin(),name.end(),name.begin(),[](unsigned char c){return char(std::tolower(c));});
        auto begin=v.find_first_not_of(" \t"),last=v.find_last_not_of(" \t");
        v=begin==std::string::npos?"":v.substr(begin,last-begin+1);
        if(!headers.emplace(name,v).second) return response(400,bad);
    }
    if(!headers.count("host")||headers.count("transfer-encoding")) return response(400,bad);
    size_t length=0;
    if(headers.count("content-length")){
        auto s=headers["content-length"];
        if(s.empty()||s.size()>3||!std::all_of(s.begin(),s.end(),[](unsigned char c){return std::isdigit(c);}))return response(400,bad);
        length=std::stoul(s); if(length>64)return response(400,bad);
    }
    if(request.size()<end+4+length)return "";
    if(request.size()!=end+4+length)return response(400,bad);
    if(method=="GET"&&path=="/"&&length==0) return response(200,PanelPage,"text/html; charset=utf-8");
    if(headers["x-souz-token"]!=token) return response(403,"{\"error\":\"unauthorized\"}");
    if(headers.count("origin")&&headers["origin"]!="http://"+headers["host"])return response(403,bad);
    if(method=="GET"&&path=="/api/info"){
        std::string body="{\"port\":"+std::to_string(port)+",\"urls\":["; bool comma=false;
        for(const auto& ip:addresses()){if(comma)body+=",";comma=true;body+="\"http://"+ip+":"+std::to_string(port)+"\"";}
        return response(200,body+"]}");
    }
    if(method=="POST"&&path=="/api/speed"){
        if(headers["content-type"]!="text/plain")return response(400,bad);
        std::istringstream input(request.substr(end+4,length));input.imbue(std::locale::classic());
        float value; if(!(input>>value)||!std::isfinite(value)||value<0||value>1)return response(400,bad);
        input>>std::ws; if(!input.eof())return response(400,bad);
        speed.Set(value,true);
    } else if(!(method=="GET"&&path=="/api/state"))return response(404,bad);
    std::ostringstream body;body.imbue(std::locale::classic());
    body<<"{\"speed\":"<<SpeedState::Value(speed.Snapshot())<<"}";
    return response(200,body.str());
}
struct Client {
    Handle socket;
    std::string input,output;
    size_t sent=0;
    bool draining=false; // response fully sent, write side shut down, discarding leftovers
    std::chrono::steady_clock::time_point deadline=std::chrono::steady_clock::now()+std::chrono::seconds(2);
    explicit Client(Socket s):socket(s){}
};
}
PanelServer::PanelServer(SpeedState& s):speed(s),worker(&PanelServer::Run,this){}
PanelServer::~PanelServer(){stopping.store(true);if(worker.joinable())worker.join();}
void PanelServer::Run() noexcept {
    try {
        [[maybe_unused]] Network network;
        Handle listener(::socket(AF_INET,SOCK_STREAM,IPPROTO_TCP));
        if(listener.s==invalid)throw std::runtime_error("socket");
#ifdef _WIN32
        BOOL exclusive=TRUE;
        if(setsockopt(listener.s,SOL_SOCKET,SO_EXCLUSIVEADDRUSE,reinterpret_cast<const char*>(&exclusive),sizeof exclusive))throw std::runtime_error("exclusive bind");
#endif
        sockaddr_in address{};address.sin_family=AF_INET;address.sin_addr.s_addr=htonl(INADDR_ANY);address.sin_port=0;
        if(bind(listener.s,reinterpret_cast<sockaddr*>(&address),sizeof address)||listen(listener.s,16))throw std::runtime_error("bind/listen");
        nonblock(listener.s);
#ifdef _WIN32
        int length=sizeof address;
#else
        socklen_t length=sizeof address;
#endif
        if(getsockname(listener.s,reinterpret_cast<sockaddr*>(&address),&length))throw std::runtime_error("getsockname");
        token=makeToken();port.store(ntohs(address.sin_port));
        std::vector<std::unique_ptr<Client>> clients;
        while(!stopping.load()){
            if(openRequested.exchange(false)){
#ifdef _WIN32
                const std::string url="http://127.0.0.1:"+std::to_string(port.load())+"/#"+token;
                // Shell invocation happens on this worker, never the GL thread.
                const std::wstring wide(url.begin(),url.end());
                const HRESULT com = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
                if(reinterpret_cast<INT_PTR>(ShellExecuteW(nullptr,L"open",wide.c_str(),nullptr,nullptr,SW_SHOWNORMAL))<=32)
                    OutputDebugStringA("Souz Content: could not open default browser.\n");
                if(SUCCEEDED(com)) CoUninitialize();
#endif
            }
            fd_set reads,writes;FD_ZERO(&reads);FD_ZERO(&writes);FD_SET(listener.s,&reads);
            Socket highest=listener.s;
            for(auto& c:clients){FD_SET(c->socket.s,(c->output.empty()||c->draining)?&reads:&writes);highest=std::max(highest,c->socket.s);}
            timeval wait{0,10000};
            if(select(int(highest+1),&reads,&writes,nullptr,&wait)<0){if(wouldBlock())continue;throw std::runtime_error("select");}
            // Process existing clients before accepting: a new socket isn't in these sets.
            for(auto it=clients.begin();it!=clients.end();){
                auto& c=**it;bool done=std::chrono::steady_clock::now()>c.deadline;
                if(!done&&c.draining&&FD_ISSET(c.socket.s,&reads)){
                    // Graceful close: swallow unread request bytes so the OS does not
                    // answer with a TCP reset that could erase our response (Windows).
                    char junk[2048];int n=recv(c.socket.s,junk,sizeof junk,0);
                    if(n==0||(n<0&&!wouldBlock()))done=true;
                }
                if(!done&&!c.draining&&c.output.empty()&&FD_ISSET(c.socket.s,&reads)){
                    char bytes[2048];int n=recv(c.socket.s,bytes,sizeof bytes,0);
                    if(n>0){c.input.append(bytes,n);c.output=route(c.input,token,speed,port.load());}
                    else if(n==0||!wouldBlock())done=true;
                }
                if(!done&&!c.draining&&!c.output.empty()&&FD_ISSET(c.socket.s,&writes)){
#ifdef _WIN32
                    constexpr int flags=0;
#else
                    constexpr int flags=MSG_NOSIGNAL;
#endif
                    int n=send(c.socket.s,c.output.data()+c.sent,int(c.output.size()-c.sent),flags);
                    if(n>0){
                        c.sent+=size_t(n);
                        if(c.sent==c.output.size()){
#ifdef _WIN32
                            shutdown(c.socket.s,SD_SEND);
#else
                            shutdown(c.socket.s,SHUT_WR);
#endif
                            c.draining=true;
                            c.deadline=std::min(c.deadline,std::chrono::steady_clock::now()+std::chrono::milliseconds(500));
                        }
                    }else if(n==0||!wouldBlock())done=true;
                }
                if(done)it=clients.erase(it);else ++it;
            }
            if(FD_ISSET(listener.s,&reads)){
                Socket s=accept(listener.s,nullptr,nullptr);
                if(s!=invalid){
                    auto client=std::make_unique<Client>(s);
#ifndef _WIN32
                    if(s>=FD_SETSIZE)continue;
#endif
                    if(clients.size()<24){nonblock(s);clients.push_back(std::move(client));}
                }
            }
        }
    }catch(const std::exception&){
#ifdef _WIN32
        OutputDebugStringA("Souz Content: HTTP panel stopped after an error.\n");
#endif
    }
    port.store(0);
}
}

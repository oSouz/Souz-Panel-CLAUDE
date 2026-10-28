# Souz Content — validação desta entrega

O ZIP recebido já continha o servidor e a integração inicial com o Background Gen. Esta revisão mantém essa base e acrescenta recuperação automática dos links da instância após falha temporária, além do teste de comunicação JavaScript no workflow Windows.

## Executado nesta revisão

- Compilação do servidor real e harness em C++17 com GCC, -Wall e -Wextra.
- Testes HTTP aprovados: página incorporada, chave por instância, escrita de Speed, atualização pelo host, duas instâncias, valores inválidos, origem cruzada, requisições concorrentes/fragmentadas, cliente lento, encerramento e ciclos de criação/remoção.
- Teste Node com DOM mínimo e HTTP real aprovado: recuperação dos links após falha inicial, sem duplicação; slider, leitura do host, pausa e desconexão.
- HTML atualizado incorporado novamente em src/PanelPage.h.

## Ainda precisa ser executado

O ambiente desta revisão é Linux. Não foi compilada uma DLL Windows nem carregado o plugin no Resolume. O teste JavaScript verifica lógica de comunicação, não aparência num navegador real.

Use o workflow incluído para compilar com MSVC e verificar plugMain. Depois execute o checklist de PAINEL_SOUZ.md no computador de operação, incluindo botão, persistência, celular, firewall e FPS. As APIs do SDK e a integração gráfica não foram recompiladas ou verificadas nesta revisão.

## Reproduzir o teste isolado

```sh
g++ -std=c++17 -Wall -Wextra -pthread -Isrc tests/panel_harness.cpp src/PanelServer.cpp -o panel_harness
python3 tests/test_panel.py ./panel_harness
node tests/test_frontend.mjs ./panel_harness
```

## Revisão visual

A interface do painel foi redesenhada com a identidade Souz Content (marca, paleta magenta/âmbar/violeta, controle grande, layout para celular). A lógica de comunicação e os IDs dos elementos não mudaram; os testes HTTP e Node passam. Renderização conferida em Chromium headless (desktop e 390 px). Continua pendente: compilar a DLL no Windows e testar no Resolume.

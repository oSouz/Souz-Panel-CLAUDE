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

## Correção após o primeiro build no Windows

O GitHub Actions compilou a DLL, mas o teste `panel_http` falhou com `ConnectionResetError 10054` ao enviar um corpo maior que o limite. Causa provável: o servidor fechava o socket com bytes da requisição ainda não lidos, e o Windows envia um reset que pode descartar a resposta 400. Correção: depois de enviar a resposta, o servidor encerra o lado de escrita e descarta os bytes restantes por até 500 ms antes de fechar. Adicionado teste de regressão com corpo enviado depois dos cabeçalhos. Passa no Linux; a confirmação no Windows depende de rodar o workflow de novo.

## Todos os parâmetros no painel (revisão atual)

Adicionado: banco de 34 parâmetros no servidor, esquema gerado (`src/PanelSchema.h`), API `GET /api/schema`, `GET /api/state` com todos os valores e `POST /api/set` em lote, e a nova interface em dois blocos com o layout enviado pelo Souz.

Executado em Linux: servidor real com g++ -Wall -Wextra sem avisos; teste HTTP (esquema, índices, limites de cada tipo, lote atômico, origem web/host, duas instâncias, encerramento, regressão do reset do Windows) repetido três vezes; teste Node da interface (dois blocos, todos os tipos de controle, lote, sincronização host→painel, arraste protegido, restaurar padrão, desconexão), conferido com mutações propositais; teste em Chromium real com cliques, arraste, seletor de cor, recarregamento e viewport de 390 px.

`BackgroundGen.cpp` foi verificado apenas quanto a tipos, contra um substituto mínimo do SDK, não contra o SDK da Resolume. Continua pendente no Windows/Resolume: compilar com MSVC, e confirmar que o Resolume aceita alterações de Engine, Shape, Palette, Reverse, Invert e cores vindas do plugin (`SetFloatParameter` na base do SDK + `FF_EVENT_FLAG_VALUE`). Se alguma opção não mudar de forma coerente, o ponto a investigar é o valor que o SDK espera para parâmetros de opção.

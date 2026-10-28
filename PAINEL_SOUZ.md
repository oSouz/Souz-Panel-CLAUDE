# Souz Content — primeiro teste do painel

Esta versão modifica o BackgroundGen original. O nome `Background Gen`, o ID `ABGE` e todos os 34 parâmetros originais foram preservados. O botão `Abrir painel` foi acrescentado no final. Apenas **Speed** está disponível no navegador nesta etapa; os demais controles continuam no Resolume.

## Compilar e testar no seu computador

1. Substitua os arquivos do seu repositório pelo conteúdo da pasta `BackgroundGen` deste ZIP, incluindo `.github/workflows/build.yml`.
2. Na aba Actions, execute `Build FFGL plugin (Windows x64)`. O fluxo compila a DLL, testa o servidor e confere a exportação `plugMain`.
3. Baixe `BackgroundGen-win64`. Feche o Resolume e faça uma cópia de segurança da DLL antiga. Substitua-a pela nova `BackgroundGen.dll` na pasta de efeitos adicionais configurada no Resolume. Não deixe duas DLLs com o mesmo ID nessa pasta.
4. Abra o Resolume, carregue `Sources → FFGL → Background Gen` em um clipe e deixe-o ativo.
5. No final dos parâmetros, clique em **Abrir painel**. O navegador padrão deve abrir automaticamente.
6. Mova **Velocidade**: 0 pausa o tempo da animação, 1 equivale a 4×. O botão **Padrão** restaura Speed a 0,35 (0,49×). O botão **Pausar** define Speed como 0.
7. Mova Speed no Resolume e confira a atualização no navegador. Para este teste, desative automações de Speed.
8. No painel, copie o link correspondente ao IP da sua rede e abra-o no celular conectado à mesma rede. Use o link completo: ele contém a chave de acesso no trecho após `#`.

Compilação local: Visual Studio 2022 com desenvolvimento C++, CMake, Git e Python 3. Execute `build_windows.bat`. O script gera as fontes, compila, roda os testes e copia a DLL para a pasta de efeitos usada pelo projeto original. Se o seu Resolume usa outra pasta, copie para a pasta das preferências.

Para sincronização dos valores com a interface do host, use Resolume 7.4 ou posterior, que oferece os eventos FFGL de mudança de valor. Valide na sua versão antes de usar em evento ao vivo.

## Rede e instâncias

- Cada instância ativa cria um servidor interno e recebe uma porta IPv4 livre do Windows. Não há porta fixa nem arquivo de configuração compartilhado.
- O painel mostra a porta para identificar a instância e os endereços IPv4 disponíveis, incluindo localhost. Adaptadores de VPN também podem aparecer; escolha o IP da rede usada pelo celular.
- O acesso remoto depende do firewall do Windows permitir o Resolume na rede privada. Redes de convidados ou isolamento entre dispositivos podem impedir a conexão.
- Cada servidor tem uma chave aleatória própria. O HTML não contém a chave; o botão a fornece no fragmento do link. As APIs exigem essa chave em um cabeçalho e rejeitam origens diferentes. Sem exposição de arquivos locais, comandos arbitrários ou serviços externos.
- O acesso é HTTP sem criptografia, destinado à rede local confiável. Não configure encaminhamento dessa porta no roteador.
- Ao liberar os recursos GL/remover a instância, o servidor fecha clientes e a porta, e aguarda sua thread terminar. Fechar apenas a aba do navegador não remove o plugin.
- Ao reinicializar uma instância, a porta e a chave podem mudar. Clique novamente em Abrir painel; links antigos não são permanentes.
- Um clipe pausado/inativo pode continuar existindo no host. Valores recebidos serão usados no próximo processamento de quadro. A vida do servidor acompanha Init/Clean do SDK, não a visibilidade do clipe.

## Arquitetura e sincronização

`src/PanelServer.cpp` implementa o servidor no próprio processo. `web/panel.html` é incorporado em `src/PanelPage.h` por `tools/embed_panel.py`; a DLL não precisa de HTML externo, Node, Python, serviço ou executável auxiliar para rodar.

O servidor usa sockets não bloqueantes e um loop com espera de até 10 ms, no máximo 24 clientes e prazo absoluto de 2 segundos por conexão. Limita cabeçalhos a 8 KiB e corpo a 64 bytes. Clientes lentos não bloqueiam outros clientes nem o render. A abertura do navegador e a enumeração de interfaces também ocorrem fora da thread de renderização.

O parâmetro Speed usa um registro atômico de 64 bits contendo valor, revisão e origem. O navegador jamais acessa objetos do SDK ou OpenGL. Antes de o framework enviar os uniforms, o host aplica a revisão mais recente e emite `FF_EVENT_FLAG_VALUE` para valores recebidos da web. O getter do parâmetro reflete o valor atual para persistência/consulta pelo host. A ordem de chegada prevalece; automações do Resolume continuam podendo escrever o parâmetro.

A página consulta o estado a cada 100 ms após a resposta anterior, agrupa movimentos pendentes do slider e envia apenas uma alteração por vez. Durante o gesto, respostas antigas não reposicionam o controle. O vídeo mantém sua taxa de quadros: a comunicação não espera resposta do host. Não há streaming de prévia de vídeo nesta etapa.

O SDK é mantido no commit original `5b6e07840277df9ec35a228b9eb067636316350f`. Documentação de eventos: https://github.com/resolume/ffgl (exemplo `source/plugins/Events`).

## Checklist de aceitação no Windows/Resolume

- [ ] Build e testes do GitHub Actions verdes; DLL x64 com plugMain.
- [ ] Instalar, carregar e abrir o navegador pelo botão.
- [ ] Speed muda visual, slider do host e painel nas duas direções.
- [ ] Salvar/reabrir composição conserva Speed, mas não dispara Abrir painel sozinho.
- [ ] Duas instâncias abrem portas diferentes e não alteram uma à outra.
- [ ] Celular e computador controlam a mesma instância.
- [ ] Remover uma instância interrompe apenas seu painel; a outra continua.
- [ ] Fechar/reabrir o Resolume não deixa servidor ou processo auxiliar.
- [ ] Testar FPS habitual com painel aberto, uso rápido do slider e perda de Wi-Fi.

A abertura do navegador usa ShellExecuteW no worker. O encerramento aguarda a conclusão dessa chamada do Windows se ela estiver em curso; os testes de prazo de encerramento cobrem os sockets, não um shell do Windows travado.

## Escopo da validação entregue

Os testes de HTTP executam o servidor real em Linux e são incluídos no workflow para execução no Windows. Não substituem o teste com o host gráfico. A DLL Windows e a operação no Resolume precisam ser validadas pelo workflow e pelo checklist acima; este pacote é código-fonte, não uma DLL compilada.

## Revisão de recuperação de conexão

Se a consulta inicial dos links de rede falhar, o painel tenta novamente após recuperar a comunicação, sem duplicar links. O workflow agora também executa tests/test_frontend.mjs com Node 22. Consulte VALIDACAO.md para o escopo exato das verificações desta entrega.

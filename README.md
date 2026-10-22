# BTS Show Alert 2026

Extensão do Chrome que consulta a venda geral do BTS no MorumBIS e avisa neste computador e no iPhone.

- [28/10/2026](https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-28-10)
- [30/10/2026](https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-30-10)
- [31/10/2026](https://www.ticketmaster.com.br/event/venda-geral-bts-world-tour-arirang-31-10)

O aviso do iPhone é uma notificação do próprio sistema. A mensagem passa pelo serviço de push da Apple, que é o caminho do iOS para mostrar um banner. A chave secreta fica no Chrome. A compra continua manual no site da Ticketmaster.

## Chrome

1. Abra `chrome://extensions`.
2. Ative o modo do desenvolvedor.
3. Escolha "Carregar sem compactação" e selecione a pasta `extension`.
4. O Chrome consulta as três páginas uma vez por minuto e pede para o computador não dormir enquanto a extensão estiver carregada. Cada consulta lê, duas vezes, o estado oficial do evento: status da venda, show disponível, setores, fila e ofertas. Qualquer um desses sinais, ou uma mudança que não dê para classificar, avisa neste computador e no iPhone.

## iPhone

A página que o iPhone usa já está no GitHub Pages:

https://luanedcosta.github.io/bts-show-alert-2026/iphone/

1. Abra as opções da extensão, em "Parear iPhone".
2. Informe seu e-mail de contato.
3. No campo "Endereço da página", cole o endereço acima, com a barra no final.
4. Copie o "Link para abrir no Safari". Esse link traz a chave no final (`#k=...`) e não deve ser publicado.
5. No iPhone, abra esse link no Safari.
6. Toque em Compartilhar, depois em Adicionar à Tela de Início, e deixe "Abrir como App Web" ligado.
7. Feche a aba do Safari e abra o ícone novo. O botão "Ativar avisos" continua bloqueado no Safari; ele só libera dentro desse ícone. Toque nele e copie a inscrição. Se o ícone abrir sem a chave, apague-o e adicione de novo a partir do link.
8. No Windows, dê dois cliques em `start-relay.cmd`, na pasta do projeto, e deixe essa janela aberta. Se o Node não estiver instalado, o script baixa uma cópia só para este usuário, em `%LOCALAPPDATA%\bts-show-alert\node`, sem pedir administrador.
9. Nas opções da extensão, deixe o endereço e a senha do encaminhador em branco. Cole a inscrição, salve e toque em "Enviar teste". O banner deve chegar no iPhone.

O Chrome 153 recusa o certificado atual de `web.push.apple.com` (`ERR_CERT_AUTHORITY_INVALID`). O `start-relay.cmd` sobe um encaminhador local que ainda aceita essa cadeia. Ele escuta só em `127.0.0.1` e só encaminha para `*.push.apple.com`. O Chrome precisa continuar aberto para consultar a Ticketmaster. Feche a janela do encaminhador só quando não quiser mais o aviso no iPhone.

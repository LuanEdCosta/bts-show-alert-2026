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
4. O Chrome passa a consultar as três páginas cerca de uma vez por minuto.

## iPhone

A pasta `iphone` precisa ficar num endereço https estável. Publique só essa pasta. Ela não contém a chave secreta.

1. Nas opções da extensão, informe seu e-mail e o endereço https da página.
2. Abra o link gerado no Safari.
3. Compartilhar → Adicionar à Tela de Início, com "Abrir como App Web" ligado.
4. Abra o ícone, toque em "Ativar avisos" e cole a inscrição de volta na extensão.
5. Envie o teste e confira o banner no iPhone.

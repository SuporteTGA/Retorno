# 📋 Registro Diário de Atividades — Luis & Carlos

**Acesse:** https://suportetga.github.io/Retorno/

Já configurado no projeto Firebase **ayel-42a56** (login Google + Firestore em São Paulo). Usuários: suporte@tga.adm.br (Luis) e pdi@tga.adm.br (Carlos).

Sistema web que substitui a planilha **"Retorno diário - Bruno"**. Luis e Carlos registram as tarefas durante o dia e o **dashboard** e o **relatório do dia** (com a mensagem pronta para o Bruno) são gerados automaticamente, em tempo real.

- **Hospedagem:** GitHub Pages (grátis)
- **Banco de dados e login:** Firebase (Firestore + login Google, plano gratuito Spark)
- **Tempo real:** o que um registra aparece na hora na tela do outro

## Funcionalidades

| Aba | O que faz |
|---|---|
| ➕ Nova atividade | Formulário com as 13 colunas da planilha (Data, Hora inicial/final, Tempo calculado, Empresa, Categoria, Prioridade, Atividade, Resultado, Status, Próxima ação, Solicitante, Observações). Botão **▶ Iniciar agora** abre uma atividade "Em andamento" e **✔ Concluir** fecha com a hora atual. |
| 📋 Registros | Tabela com filtros (pessoa, período, status, empresa, busca), editar/excluir e exportar CSV. |
| 📊 Dashboard | Os mesmos indicadores da aba Dashboard da planilha (total, concluídas, em andamento, aguardando cliente, horas, empresas atendidas, visitas técnicas, suportes remotos, reuniões, administrativas, tempo médio, produtividade diária/semanal/mensal) + gráficos por categoria, status, empresa, prioridade e horas por dia. Filtro por pessoa e período. |
| 📄 Relatório do dia | Resumo do dia por pessoa, entregas, pendências e **mensagem pronta para o Bruno** (copiar ou abrir no WhatsApp). |
| ⚙️ Cadastros | Edita as listas (categorias, empresas, status, prioridades, solicitantes) e **importa o histórico** da planilha (.xlsx). |

> Sem configurar o Firebase o sistema abre em **modo demo** (dados ficam só no navegador) — útil para testar.

---

## Passo a passo de instalação (≈15 min)

### 1. Criar o projeto no Firebase
1. Acesse <https://console.firebase.google.com> → **Adicionar projeto** (ex.: `registro-atividades`). Pode desativar o Google Analytics.
2. Menu **Criação → Authentication → Vamos começar → Google → Ativar** → Salvar.
3. Menu **Criação → Firestore Database → Criar banco de dados** → local `southamerica-east1 (São Paulo)` → **modo de produção**.
4. Na aba **Regras** do Firestore, cole o conteúdo de [`firestore.rules`](firestore.rules) **trocando os e-mails** pelos e-mails Google do Luis e do Carlos → **Publicar**.
5. Engrenagem ⚙️ → **Configurações do projeto → Seus apps → `</>` (Web)** → registre o app → copie o objeto `firebaseConfig`.

### 2. Configurar o sistema
Edite [`config.js`](config.js):
- cole o `firebaseConfig`;
- em `USUARIOS`, coloque os mesmos e-mails → `"Luis"` / `"Carlos"`.

### 3. Publicar no GitHub Pages
1. Crie um repositório (ex.: `registro-atividades`) e envie todos estes arquivos.
2. No repositório: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** → Save.
3. Em ~1 min o site estará em `https://SEU-USUARIO.github.io/registro-atividades/`.
4. Volte ao Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar domínio** → `SEU-USUARIO.github.io`.

### 4. Importar o histórico
1. Na planilha antiga: **Arquivo → Fazer download → Microsoft Excel (.xlsx)**.
2. No sistema: aba **⚙️ Cadastros → Importar histórico** → selecione o arquivo → **Importar**.
   Lê as abas *Registro Diário Luis* e *Registro Diário Carlos*. Pode importar de novo sem duplicar.

---

## Observações
- **Segurança:** a `apiKey` do Firebase não é segredo (é normal ficar pública no GitHub). Quem protege os dados são as regras do Firestore — só os e-mails listados conseguem ler/gravar.
- **Bruno ver o dashboard:** adicione o e-mail dele em `firestore.rules` e em `USUARIOS` (se mapear para um nome que não está em `PESSOAS`, ele verá a tela "Quem é você?" — para só visualizar, basta escolher qualquer nome e usar as abas Dashboard/Registros).
- **Offline:** o Firestore guarda em cache; registros feitos sem internet sincronizam quando a conexão volta (indicador ● no topo: verde = sincronizado).
- **Diferença em relação à planilha:** o Dashboard da planilha somava **só a aba do Luis** (247 tarefas), apesar do título "Luis Henrique e Carlos". Aqui o padrão é os dois juntos, com filtro por pessoa.

## Estrutura
```
index.html          páginas/abas
style.css           visual (claro/escuro automático)
config.js           ← único arquivo a editar
store.js            Firebase / modo demo
app.js              lógica, dashboard, relatório, importação
firestore.rules     regras de segurança do banco
```

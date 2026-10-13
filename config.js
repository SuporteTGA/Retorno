// ============================================================
//  CONFIGURAÇÃO — edite este arquivo antes de publicar
// ============================================================

// 1) Cole aqui a configuração do seu projeto Firebase
//    (Console Firebase → Configurações do projeto → Seus apps → Web → firebaseConfig)
//    Enquanto apiKey começar com "COLE", o sistema roda em MODO DEMO
//    (dados salvos só neste navegador, sem login e sem tempo real entre pessoas).
export const firebaseConfig = {
  apiKey: "AIzaSyB8KXP8JfWUT6NZVu5QBCZ9Tafn9rpDv7Y",
  authDomain: "ayel-42a56.firebaseapp.com",
  projectId: "ayel-42a56",
  storageBucket: "ayel-42a56.firebasestorage.app",
  messagingSenderId: "744118757054",
  appId: "1:744118757054:web:84eadfb03da268bdea60ef",
};

// 2) Quem usa o sistema: e-mail Google → nome que aparece nos registros.
//    Os mesmos e-mails precisam estar no arquivo firestore.rules.
//    Se alguém entrar com um e-mail que não está aqui, o sistema pergunta "Quem é você?".
export const USUARIOS = {
  "suporte@tga.adm.br": "Luis",
  "pdi@tga.adm.br": "Carlos",
};

// 3) Pessoas que registram atividades (ordem das abas/filtros)
export const PESSOAS = ["Luis", "Carlos"];

// 4) Nome do gestor que recebe o relatório diário
export const GESTOR = "Bruno";

// 5) Listas iniciais (podem ser editadas depois na aba Cadastros)
export const CADASTROS_PADRAO = {
  categorias: [
    "Configuração", "Desenvolvimento", "Planejamento", "Manutenção", "Suporte Remoto",
    "Visita Técnica", "Instalação", "Reunião", "Treinamento", "Administrativo",
    "Comercial", "Financeiro", "Pesquisa", "SAC", "RH", "Outro",
  ],
  prioridades: ["Alta", "Média", "Baixa"],
  status: ["Concluído", "Em andamento", "Aguardando Cliente", "Aguardando Fornecedor", "Cancelado"],
  empresas: ["Azul Administradora", "Ayel", "Peglev", "TGA", "Condoshop", "Soluções Prediais"],
  solicitantes: ["Bruno Tavares", "Flávio Souza", "Nelson Paiva", "Matheus", "Adrielle", "Normelio Simon"],
};

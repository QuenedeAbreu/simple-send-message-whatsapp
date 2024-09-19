import express, { Request, Response } from 'express';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
const port = 3000;
let qrCodeData: string = ''; // Armazena o QR code gerado
const sessionPath = './.wwebjs_auth'; // Caminho da sessão
let client: Client; // Variável global para o cliente do WhatsApp

// Middleware para lidar com JSON
app.use(express.json());

// Configurar o middleware cors
app.use(cors());

// Função para inicializar o cliente do WhatsApp
function initializeWhatsAppClient() {
  client = new Client({
    puppeteer: {
      headless: true, // Modo "headless", sem abrir janela do navegador
      args: ['--no-sandbox'], // Argumentos para o Puppeteer
    },
    authStrategy: new LocalAuth({
      clientId: 'client-one',
    }),
  });

  // Gera o QR code quando solicitado pelo WhatsApp
  client.on('qr', (qr: string) => {
    console.log('QR code gerado, convertendo para base64...');
    qrcode.toDataURL(qr, { errorCorrectionLevel: 'H', width: 400 }, (err, url) => {
      if (err) {
        console.error('Erro ao gerar QR code:', err);
        return;
      }
      qrCodeData = url; // Salva o QR code como base64
    });
  });

  client.on('ready', () => {
    console.log('Cliente do WhatsApp está pronto!');
  });

  client.initialize();
}

// Inicializar o cliente ao iniciar o servidor
initializeWhatsAppClient();

// Endpoint para servir o QR code ao frontend
app.get('/qr', (req: Request, res: Response) => {
  if (qrCodeData) {
    res.json({ qrCode: qrCodeData });
  } else {
    res.json({ error: 'QR code ainda não disponível' });
  }
});

// Endpoint para verificar o status da conexão
app.get('/status', (req: Request, res: Response) => {
  if (client && client.info && client.info.wid) {
    res.json({ connected: true });
  } else {
    res.json({ connected: false });
  }
});

// Endpoint para listar grupos do WhatsApp
app.get('/list-groups', async (req: Request, res: Response) => {
  try {
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    const groupList = groups.map(group => ({
      name: group.name, // Nome do grupo
      id: group.id._serialized, // ID do grupo
      // Propriedades adicionais não disponíveis diretamente
      description:  'Informação não disponível', // Placeholder
      participants: 'Informação não disponível', // Placeholder
      createdAt: 'Informação não disponível' // Placeholder
    }));

    res.json({ groups: groupList });
  } catch (error) {
    console.error('Erro ao listar grupos:', error);
    res.status(500).json({ error: 'Erro ao listar grupos' });
  }
});

// Endpoint para listar conversas do WhatsApp
// Endpoint para listar conversas do WhatsApp
app.get('/list-chats', async (req: Request, res: Response) => {
  try {
    const chats = await client.getChats();
    
    // Filtra para incluir apenas conversas individuais (não grupos)
    const chatList = chats
      .filter(chat => !chat.isGroup) // Exclui grupos
      .map(chat => ({
        name: chat.name, // Nome do chat
        id: chat.id._serialized, // ID do chat
        lastMessage: chat.lastMessage ? chat.lastMessage.body : 'Nenhuma mensagem ainda' // Última mensagem
      }));

    res.json({ chats: chatList });
  } catch (error) {
    console.error('Erro ao listar conversas:', error);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});


// Endpoint para enviar mensagens para um número específico
app.post('/send-message', async (req: Request, res: Response) => {
  const { phoneNumber, message } = req.body;

  if (!phoneNumber || !message) {
    return res.status(400).json({ error: 'Número e mensagem são obrigatórios!' });
  }

  try {
    const chatId = `${phoneNumber}@c.us`; // Formata o número
    await client.sendMessage(chatId, message);
    res.json({ success: `Mensagem enviada para ${phoneNumber}` });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

//Endpoint para pegar as informações do perfil conectado
app.get('/whatsapp-info', async (req: Request, res: Response) => {
  try {
    const state = await client.getState();

    if (state === 'CONNECTED') {
      const userInfo = client.info;

      // Obter a foto de perfil
      const profilePicUrl = await client.getProfilePicUrl(userInfo.wid._serialized);

      res.json({
        connected: true,
        userPhone: userInfo.wid.user,
        userName: userInfo.pushname,
        profilePic: profilePicUrl || 'Sem foto de perfil',
      });
    } else {
      res.json({
        connected: false,
        message: 'WhatsApp não está conectado',
      });
    }
  } catch (error) {
    console.error('Erro ao pegar informações do WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao pegar informações do WhatsApp' });
  }
});



// Endpoint para deslogar e reinicializar o cliente do WhatsApp
app.post('/logout', async (req: Request, res: Response) => {
  try {
    // Faz logout do cliente
    await client.logout();

    // Remove a pasta de sessão
    const sessionDir = path.join(sessionPath, 'client-one');
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('Sessão removida com sucesso.');
    }

    // Verifica se o navegador do Puppeteer está disponível e fecha-o
    if (client.pupBrowser && client.pupBrowser.isConnected()) {
      await client.pupBrowser.close();
    }

    // Destroi o cliente atual e reinicializa
    client.destroy();
    initializeWhatsAppClient(); // Reinicializa o cliente do WhatsApp

    res.json({ success: 'Desconectado do WhatsApp e reinicializado com sucesso!' });
  } catch (error) {
    console.error('Erro ao deslogar e reinicializar:', error);
    res.status(500).json({ error: 'Erro ao deslogar do WhatsApp' });
  }
});

// Inicializa o servidor Express
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

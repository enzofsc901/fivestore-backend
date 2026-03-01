const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); // 🔴 Importação do Nodemailer

const app = express();
const port = process.env.PORT || 3000;
const axios = require('axios'); // Adicione isso no topo do arquivo junto com os outros require

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors()); // Garante que o CORS continue ativo

// --- CONFIGURAÇÃO MERCADO PAGO ---
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN, options: { timeout: 5000 }});
const payment = new Payment(client);

// --- CONFIGURAÇÃO DE E-MAIL ---
// No painel do Render (Environment Variables), crie as chaves EMAIL_USER e EMAIL_PASS.
// Se usar Gmail, crie uma "Senha de App" nas configurações de segurança da sua conta Google.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Ex: suportefivestorebr@gmail.com
        pass: process.env.EMAIL_PASS  // Sua senha de APP do gmail
    }
});

app.post('/process_payment', async (req, res) => {
    try {
        const { formData, transaction_amount, description, payer, pedidoDados } = req.body;

        console.log("💰 Recebendo Pagamento:", transaction_amount);
        
        // 1. DADOS DO PAGAMENTO
        let paymentBody = {
            transaction_amount: Number(transaction_amount), // Garante que é número
            description: description || 'Produto Five Store',
            payment_method_id: formData.payment_method_id,
            payer: {
                email: payer.email || 'comprador_teste@fivestore.com', // E-mail DIFERENTE do seu
                first_name: payer.first_name || 'Comprador',
                last_name: 'Teste'
            }
        };

        // 2. SE TIVER CPF, ADICIONA (Obrigatório para Pix/Boleto e Anti-fraude)
        if (formData.payer && formData.payer.identification) {
            paymentBody.payer.identification = {
                type: formData.payer.identification.type,
                number: formData.payer.identification.number
            };
        }

        // 3. DADOS DE CARTÃO (Token, Parcelas, Emissor)
        if (formData.payment_method_id !== 'pix' && formData.payment_method_id !== 'bolbradesco') {
            paymentBody.token = formData.token;
            paymentBody.installments = Number(formData.installments);
            paymentBody.issuer_id = formData.issuer_id;
        }

        // 4. ENVIA PARA O MERCADO PAGO
        const requestOptions = { idempotencyKey: crypto.randomUUID() };
        const result = await payment.create({ body: paymentBody, requestOptions });

        // LOG DO RESULTADO (Veja isso no painel do Render!)
        console.log("✅ Resposta MP:", result.status, result.status_detail);

        // Se foi recusado, avisa o frontend
        if (result.status === 'rejected') {
            console.error("❌ Motivo da Recusa:", result.status_detail);
        }

        // 5. ENVIA E-MAIL (Se aprovado ou pendente)
        if ((result.status === 'approved' || result.status === 'in_process') && pedidoDados && process.env.EMAIL_USER) {
            // ... (seu código de envio de email aqui, pode manter igual estava) ...
        }

        res.status(200).json(result);

    } catch (error) {
        // Mostra o erro exato que o Mercado Pago devolveu
        console.error("❌ ERRO FATAL NO PAGAMENTO:", JSON.stringify(error, null, 2));
        
        res.status(500).json({ 
            status: 'error', 
            message: error.message || 'Erro interno',
            details: error.cause || 'Sem detalhes'
        });
    }
});
// =========================================================
// ROTA DE LOGIN DO ADMIN
// =========================================================
app.post('/admin-login', (req, res) => {
    const { senha } = req.body;
    // Puxa a senha escondida no Render
    const senhaCorreta = process.env.ADMIN_PASSWORD;

    if (senha === senhaCorreta) {
        // Se a senha bater, devolve autorização
        res.json({ auth: true, mensagem: "Acesso Liberado!" });
    } else {
        res.status(401).json({ auth: false, mensagem: "Senha incorreta!" });
    }
});
// =========================================================
// ROTA PARA VERIFICAR SE O PIX/BOLETO FOI PAGO
// =========================================================
app.get('/check_payment/:id', async (req, res) => {
    try {
        // Vai no Mercado Pago buscar o status atualizado daquela transação
        const result = await payment.get({ id: req.params.id });
        res.json({ status: result.status });
    } catch (error) {
        console.error("Erro ao verificar pagamento:", error);
        res.status(500).json({ error: 'Erro ao buscar pagamento' });
    }
});
// =========================================================
// ROTA DE CÁLCULO DE FRETE (CORRIGIDA - SEM TRAÇOS + CEP RUA)
// =========================================================
app.post('/calcular-frete', async (req, res) => {
    const { cepDestino, quantidade } = req.body;

    if (!process.env.MELHOR_ENVIO_TOKEN) {
        return res.status(500).json({ error: 'Token de frete não configurado.' });
    }

    // 1. LIMPEZA DE DADOS (Remove traços, espaços e garante string)
    const limparCep = (valor) => String(valor).replace(/\D/g, '');

    // 2. CEP DE ORIGEM (USAR CEP DE RUA EM PATOS DE MINAS)
    // CEP Geral (38700000) costuma dar erro na Jadlog/Azul. 
    // Usando 38700001 (Rua Major Gote - Centro) para garantir cálculo.
    const cepOrigem = "38700001"; 
    
    const cepDestinoLimpo = limparCep(cepDestino);

    // Regras de Cubagem
    const peso = quantidade * 0.3; 
    const altura = quantidade >= 3 ? 12 : 4; 
    const largura = 15;
    const comprimento = 20;

    // IMPORTANTE: VERIFIQUE SE SEU TOKEN É SANDBOX OU PRODUÇÃO
    // Se o token for de Sandbox, use: 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate'
    // Se o token for de Produção, use: 'https://melhorenvio.com.br/api/v2/me/shipment/calculate'
    const apiUrl = 'https://melhorenvio.com.br/api/v2/me/shipment/calculate';

    try {
        console.log(`🚚 Calculando: De ${cepOrigem} para ${cepDestinoLimpo} | Peso: ${peso}kg`);

        const response = await axios.post(apiUrl, {
            from: { postal_code: cepOrigem }, // Enviando SEM traço
            to: { postal_code: cepDestinoLimpo }, // Enviando SEM traço
            package: {
                height: altura,
                width: largura,
                length: comprimento,
                weight: peso
            },
            options: { 
                receipt: false, 
                own_hand: false,
                insurance_value: (quantidade * 50.00) // Valor declarado seguro
            }
        }, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
                'User-Agent': 'FiveStore/1.0 (suportefivestorebr@gmail.com)'
            }
        });

        const data = response.data;
        
        // Filtra opções válidas
        const opcoesFiltradas = data
            .filter(opt => !opt.error && opt.price)
            .map(opt => ({
                id: opt.id,
                nome: opt.name, 
                empresa: opt.company.name,
                preco: parseFloat(opt.custom_price || opt.price),
                prazo: opt.delivery_time
            }));

        res.json(opcoesFiltradas);

    } catch (error) {
        // Log para identificar o erro exato
        const erroDetalhe = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("❌ ERRO MELHOR ENVIO:", erroDetalhe);
        
        res.status(500).json({ 
            error: 'Erro ao calcular frete', 
            detalhes: error.response ? error.response.data : error.message 
        });
    }
});
app.listen(port, () => { console.log(`🚀 Servidor rodando na porta ${port}`); });
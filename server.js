// server.js
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors()); // Permite que seu frontend (HTML) converse com este backend

// ==================================================================
// CONFIGURAÇÃO DO MERCADO PAGO
// ==================================================================
// 1. Cole seu ACCESS TOKEN aqui (Pegue em: Seu Painel MP -> Credenciais de Produção)
const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-2511799392504620-021916-1f7a6416393ff7704fab5f4c51532b58-3215406718', 
    options: { timeout: 5000 }
});

const payment = new Payment(client);

// ==================================================================
// ROTA 1: PROCESSAR PAGAMENTO (Chamada pelo seu Frontend)
// ==================================================================
app.post('/process_payment', async (req, res) => {
    try {
        const { formData, transaction_amount, description, payer } = req.body;

        const body = {
            transaction_amount: Number(transaction_amount),
            description: description || 'Produto Five Store',
            payment_method_id: formData.payment_method_id,
            payer: {
                email: payer.email,
                first_name: payer.first_name, // Opcional se vier do formulário
                identification: {
                    type: formData.payer.identification.type,
                    number: formData.payer.identification.number
                }
            },
            // Informações obrigatórias para cartão de crédito
            token: formData.token,
            installments: Number(formData.installments),
            issuer_id: formData.issuer_id,
        };

        // Cria o pagamento no Mercado Pago
        const requestOptions = { idempotencyKey: '...um-uuid-unico-aqui...' };
        const result = await payment.create({ body, requestOptions });

        // Devolve o resultado para o seu site (Aprovado, Recusado, Pendente)
        res.status(200).json(result);

    } catch (error) {
        console.error("Erro no pagamento:", error);
        res.status(500).json({ error: 'Erro ao processar pagamento', details: error.message });
    }
});

// ==================================================================
// ROTA 2: WEBHOOK (Onde o Mercado Pago avisa sobre mudanças)
// ==================================================================
// Configure esta URL no painel do MP: https://seu-site.com/webhook
app.post('/webhook', (req, res) => {
    const topic = req.query.topic || req.query.type;
    const id = req.query.id || req.query['data.id'];

    if (topic === 'payment') {
        console.log(`🔔 Atualização de Pagamento recebida! ID: ${id}`);
        // AQUI VOCÊ PODE:
        // 1. Consultar o pagamento na API para ver o status atual
        // 2. Atualizar o status no seu Firebase (Aprovado/Recusado)
        // 3. Enviar e-mail para o cliente
    }

    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});
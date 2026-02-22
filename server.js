// server.js
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// --- CONFIGURAÇÃO ---
// Certifique-se de que MP_ACCESS_TOKEN está no Environment Variables do Render
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN, 
    options: { timeout: 5000 }
});

const payment = new Payment(client);

app.post('/process_payment', async (req, res) => {
    try {
        // Log para ver o que está chegando (Ajuda a debugar no Render)
        console.log("Recebendo pagamento:", JSON.stringify(req.body, null, 2));

        const { formData, transaction_amount, description, payer } = req.body;

        // --- PROTEÇÃO CONTRA DADOS VAZIOS ---
        // 1. Garante que payer existe
        const payerEmail = (payer && payer.email) ? payer.email : 'cliente@fivestore.com';
        const payerFirstName = (payer && payer.first_name) ? payer.first_name : 'Cliente';

        // 2. Extração segura da Identificação (CPF)
        // O ?. impede o erro "Cannot read properties of undefined"
        let docType = formData.payer?.identification?.type || 'CPF';
        let docNumber = formData.payer?.identification?.number;

        // Se o Brick não mandou o CPF (comum no Pix se não configurado),
        // tentamos pegar do objeto 'payer' raiz ou usamos um genérico para teste
        if (!docNumber && payer && payer.identification) {
            docNumber = payer.identification.number;
            docType = payer.identification.type;
        }

        // --- MONTAGEM DO BODY ---
        let paymentBody = {
            transaction_amount: Number(transaction_amount),
            description: description || 'Produto Five Store',
            payment_method_id: formData.payment_method_id,
            payer: {
                email: payerEmail,
                first_name: payerFirstName,
                // Só envia identification se tivermos um número, senão o MP recusa
                ...(docNumber && {
                    identification: {
                        type: docType,
                        number: docNumber
                    }
                })
            }
        };

        // 3. Dados específicos de Cartão de Crédito
        if (formData.payment_method_id !== 'pix' && formData.payment_method_id !== 'bolbradesco') {
            paymentBody.token = formData.token;
            paymentBody.installments = Number(formData.installments);
            paymentBody.issuer_id = formData.issuer_id;
        }

        // 4. Chave Única
        const requestOptions = { 
            idempotencyKey: crypto.randomUUID() 
        };

        // 5. Criação
        const result = await payment.create({ body: paymentBody, requestOptions });
        
        console.log(`✅ Pagamento Criado: ${result.id} (${result.status})`);
        res.status(200).json(result);

    } catch (error) {
        console.error("❌ Erro no Server:", error);
        
        // Devolve o erro detalhado
        res.status(500).json({ 
            status: 'error',
            message: error.message || 'Erro interno',
            api_response: error.cause || error 
        });
    }
});

app.get('/', (req, res) => {
    res.send('API Five Store Online 🚀');
});

app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});
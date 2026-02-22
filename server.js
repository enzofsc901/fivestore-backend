// server.js
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const crypto = require('crypto'); // Biblioteca nativa do Node para gerar UUIDs

const app = express();
const port = process.env.PORT || 3000; // Importante para o Render

app.use(express.json());
app.use(cors());

// --- CONFIGURAÇÃO ---
// ATENÇÃO: Troque pelo seu NOVO Access Token gerado após o aviso de segurança
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN, // ISSO É SEGURO
    options: { timeout: 5000 }
});

const payment = new Payment(client);

app.post('/process_payment', async (req, res) => {
    try {
        const { formData, transaction_amount, description, payer } = req.body;

        // 1. Montagem básica do pagamento
        let paymentBody = {
            transaction_amount: Number(transaction_amount),
            description: description || 'Produto Five Store',
            payment_method_id: formData.payment_method_id,
            payer: {
                email: payer.email || 'email_padrao@fivestore.com',
                first_name: payer.first_name || 'Cliente',
                identification: {
                    type: formData.payer.identification.type,
                    number: formData.payer.identification.number
                }
            }
        };

        // 2. Adiciona campos específicos apenas se for CARTÃO DE CRÉDITO
        if (formData.payment_method_id !== 'pix' && formData.payment_method_id !== 'bolbradesco') {
            paymentBody.token = formData.token;
            paymentBody.installments = Number(formData.installments);
            paymentBody.issuer_id = formData.issuer_id;
        }

        // 3. Gera uma chave única para esta transação (CRUCIAL)
        const requestOptions = { 
            idempotencyKey: crypto.randomUUID() 
        };

        // 4. Cria o pagamento
        const result = await payment.create({ body: paymentBody, requestOptions });

        // Retorna o resultado
        console.log("Pagamento processado:", result.id);
        res.status(200).json(result);

    } catch (error) {
        console.error("Erro CRÍTICO no pagamento:", error);
        
        // Devolve o erro para o frontend entender o que houve
        res.status(500).json({ 
            status: 'error',
            message: error.message,
            api_response: error.cause || error 
        });
    }
});

app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});
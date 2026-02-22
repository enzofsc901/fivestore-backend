// server.js - CÓDIGO CORRIGIDO E SEGURO
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const crypto = require('crypto'); // Biblioteca nativa do Node para gerar chaves únicas

const app = express();
const port = process.env.PORT || 3000; // Necessário para o Render

app.use(express.json());
app.use(cors());

// ==================================================================
// CONFIGURAÇÃO
// AVISO: Certifique-se de ter configurado a variável MP_ACCESS_TOKEN 
// nas configurações do Render (Environment Variables).
// ==================================================================
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN, 
    options: { timeout: 5000 }
});

const payment = new Payment(client);

app.post('/process_payment', async (req, res) => {
    try {
        const { formData, transaction_amount, description, payer } = req.body;

        // 1. Montagem básica do objeto de pagamento
        // Garante que o email nunca vá vazio para não travar a API
        const payerEmail = (payer && payer.email) ? payer.email : 'cliente_padrao@fivestore.com';

        let paymentBody = {
            transaction_amount: Number(transaction_amount),
            description: description || 'Produto Five Store',
            payment_method_id: formData.payment_method_id,
            payer: {
                email: payerEmail,
                first_name: payer.first_name || 'Cliente',
                identification: {
                    type: formData.payer.identification.type,
                    number: formData.payer.identification.number
                }
            }
        };

        // 2. Lógica Condicional: Se NÃO for Pix, adiciona dados do cartão
        // Isso corrige o erro de "dados inválidos" ao tentar pagar com Pix enviando token nulo
        if (formData.payment_method_id !== 'pix' && formData.payment_method_id !== 'bolbradesco') {
            paymentBody.token = formData.token;
            paymentBody.installments = Number(formData.installments);
            paymentBody.issuer_id = formData.issuer_id;
        }

        // 3. Chave de Idempotência (CRUCIAL para evitar pagamentos duplicados ou recusados)
        const requestOptions = { 
            idempotencyKey: crypto.randomUUID() 
        };

        // 4. Cria o pagamento no Mercado Pago
        const result = await payment.create({ body: paymentBody, requestOptions });

        // Log de sucesso no terminal do servidor (aparece nos logs do Render)
        console.log(`✅ Pagamento processado. Status: ${result.status} | ID: ${result.id}`);

        // Retorna o resultado para o seu site
        res.status(200).json(result);

    } catch (error) {
        console.error("❌ Erro ao processar pagamento:", error);
        
        // Retorna um erro formatado para que o frontend entenda e mostre o alerta
        res.status(500).json({ 
            status: 'error',
            message: error.message || 'Erro interno no servidor',
            api_response: error.cause || error 
        });
    }
});

// Rota de teste para ver se o servidor está online
app.get('/', (req, res) => {
    res.send('Servidor Five Store está ON! 🚀');
});

app.listen(port, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
});
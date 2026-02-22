const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); // 🔴 Importação do Nodemailer

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

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
        // 🔴 Extraímos o 'pedidoDados' que acabamos de adicionar no frontend
        const { formData, transaction_amount, description, payer, pedidoDados } = req.body;

        const payerEmail = (payer && payer.email) ? payer.email : 'cliente@fivestore.com';
        const payerFirstName = (payer && payer.first_name) ? payer.first_name : 'Cliente';
        let docType = formData.payer?.identification?.type || 'CPF';
        let docNumber = formData.payer?.identification?.number;

        let paymentBody = {
            transaction_amount: Number(transaction_amount),
            description: description || 'Produto Five Store',
            payment_method_id: formData.payment_method_id,
            payer: { email: payerEmail, first_name: payerFirstName, ...(docNumber && { identification: { type: docType, number: docNumber }}) }
        };

        if (formData.payment_method_id !== 'pix' && formData.payment_method_id !== 'bolbradesco') {
            paymentBody.token = formData.token;
            paymentBody.installments = Number(formData.installments);
            paymentBody.issuer_id = formData.issuer_id;
        }

        const requestOptions = { idempotencyKey: crypto.randomUUID() };
        const result = await payment.create({ body: paymentBody, requestOptions });
        
        // =========================================================
        // 🔴 ALARME: DISPARO DE E-MAIL PARA O DONO
        // =========================================================
        if (pedidoDados && process.env.EMAIL_USER) {
            let itensListaHtml = pedidoDados.itens.map(i => `<li><b>${i.nome}</b> (Tam: ${i.tamanho}) - R$ ${i.preco.toFixed(2)}</li>`).join('');
            
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_USER, // Envia de você para você mesmo
                subject: `🚨 GOL! Novo Pedido - R$ ${transaction_amount.toFixed(2)} - Five Store`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
                        <h2 style="color:#009B3A; text-align: center;">⚽ Novo Pedido na Five Store!</h2>
                        
                        <h3 style="background:#002776; color:white; padding:10px; border-radius: 5px;">💳 Pagamento: ${result.status.toUpperCase()}</h3>
                        <p><b>Método:</b> ${formData.payment_method_id}</p>
                        <p><b>ID Transação Mercado Pago:</b> ${result.id}</p>

                        <h3 style="background:#002776; color:white; padding:10px; border-radius: 5px;">👤 Dados do Cliente</h3>
                        <p><b>Nome:</b> ${pedidoDados.cliente.nome}</p>
                        <p><b>CPF:</b> ${pedidoDados.cliente.cpf}</p>
                        <p><b>WhatsApp:</b> ${pedidoDados.cliente.tel}</p>

                        <h3 style="background:#002776; color:white; padding:10px; border-radius: 5px;">📍 Endereço de Entrega</h3>
                        <p>${pedidoDados.endereco.rua}, Nº ${pedidoDados.endereco.num} ${pedidoDados.endereco.comp}</p>
                        <p>Bairro ${pedidoDados.endereco.bairro} - ${pedidoDados.endereco.cidade}/${pedidoDados.endereco.uf}</p>
                        <p><b>CEP:</b> ${pedidoDados.endereco.cep}</p>

                        <h3 style="background:#002776; color:white; padding:10px; border-radius: 5px;">👕 Produtos Vendidos</h3>
                        <ul>${itensListaHtml}</ul>
                        
                        <h2 style="text-align: right; color: #009B3A;">Total: R$ ${transaction_amount.toFixed(2)}</h2>
                    </div>
                `
            };
            
            // Dispara o email sem travar a API
            transporter.sendMail(mailOptions).catch(err => console.error("Erro E-mail:", err));
        }

        res.status(200).json(result);

    } catch (error) {
        console.error("❌ Erro no Server:", error);
        res.status(500).json({ status: 'error', message: error.message || 'Erro interno' });
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
app.listen(port, () => { console.log(`🚀 Servidor rodando na porta ${port}`); });
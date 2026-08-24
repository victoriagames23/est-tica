const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const app = express();

// Configurações do Servidor
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // Processa JSON dos agendamentos
app.use(express.static('.')); // Serve os arquivos estáticos (HTML, CSS, JS)

// Conexão com o Banco de Dados da Clínica
const db = new sqlite3.Database('./esteticaglow.db');

// Inicialização das Tabelas
db.serialize(() => {
    // 1. Tabela de Clientes
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        nome TEXT NOT NULL, 
        cpf TEXT NOT NULL, 
        telefone TEXT NOT NULL
    )`);

    // 2. Tabela de Serviços/Procedimentos Estéticos (com Categoria)
    db.run(`CREATE TABLE IF NOT EXISTS servicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        descricao TEXT NOT NULL, 
        categoria TEXT NOT NULL,
        preco REAL NOT NULL, 
        tempo_estimado INTEGER NOT NULL
    )`);

    // 3. Tabela Mestre: Agendamentos
    db.run(`CREATE TABLE IF NOT EXISTS agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        cliente_id INTEGER NOT NULL, 
        data TEXT NOT NULL, 
        responsavel TEXT NOT NULL,
        total REAL NOT NULL,
        tempo_total INTEGER NOT NULL,
        FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    )`);

    // 4. Tabela Detalhe: Itens do Agendamento
    db.run(`CREATE TABLE IF NOT EXISTS itens_agendamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        agendamento_id INTEGER NOT NULL, 
        servico_id INTEGER NOT NULL, 
        preco_cobrado REAL NOT NULL,
        FOREIGN KEY (agendamento_id) REFERENCES agendamentos (id),
        FOREIGN KEY (servico_id) REFERENCES servicos (id)
    )`);
});

/* ==========================================================================
   ROTAS: CLIENTES
   ========================================================================== */

app.post('/salvar-cliente', (req, res) => {
    const { nome, cpf, telefone } = req.body;
    const sql = `INSERT INTO clientes (nome, cpf, telefone) VALUES (?, ?, ?)`;
    
    db.run(sql, [nome, cpf, telefone], (err) => {
        if (err) return res.status(500).send("Erro ao salvar cliente: " + err.message);
        res.redirect('/clientes.html');
    });
});

app.get('/listar-clientes', (req, res) => {
    const sql = `SELECT * FROM clientes ORDER BY nome ASC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/* ==========================================================================
   ROTAS: SERVIÇOS DE ESTÉTICA
   ========================================================================== */

app.post('/salvar-servico', (req, res) => {
    const { descricao, categoria, preco, tempo_estimado } = req.body;
    const sql = `INSERT INTO servicos (descricao, categoria, preco, tempo_estimado) VALUES (?, ?, ?, ?)`;
    
    db.run(sql, [descricao, categoria || 'Geral', parseFloat(preco), parseInt(tempo_estimado)], (err) => {
        if (err) return res.status(500).send("Erro ao salvar procedimento: " + err.message);
        res.redirect('/servicos.html');
    });
});

app.get('/listar-servicos', (req, res) => {
    const sql = `SELECT * FROM servicos ORDER BY categoria ASC, descricao ASC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/* ==========================================================================
   ROTAS: AGENDAMENTOS
   ========================================================================== */

app.post('/finalizar-agendamento', (req, res) => {
    const { cliente_id, data, responsavel, total, tempo_total, servicos } = req.body;

    const sqlMestre = `INSERT INTO agendamentos (cliente_id, data, responsavel, total, tempo_total) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(sqlMestre, [cliente_id, data, responsavel, total, tempo_total], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const agendamentoId = this.lastID;
        const sqlDetalhe = `INSERT INTO itens_agendamento (agendamento_id, servico_id, preco_cobrado) VALUES (?, ?, ?)`;
        const stmt = db.prepare(sqlDetalhe);

        servicos.forEach(item => {
            stmt.run(agendamentoId, item.id, item.preco);
        });

        stmt.finalize((errFinalize) => {
            if (errFinalize) return res.status(500).json({ success: false, error: errFinalize.message });
            res.json({ success: true });
        });
    });
});

app.get('/listar-agendamentos', (req, res) => {
    const sql = `
        SELECT a.id, a.data, a.responsavel, a.total, a.tempo_total, c.nome as nome_cliente 
        FROM agendamentos a 
        INNER JOIN clientes c ON a.cliente_id = c.id 
        ORDER BY a.id DESC`;
        
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/detalhes-agendamento/:id', (req, res) => {
    const { id } = req.params;
    const sql = `
        SELECT i.preco_cobrado, s.descricao, s.categoria, s.tempo_estimado 
        FROM itens_agendamento i 
        INNER JOIN servicos s ON i.servico_id = s.id 
        WHERE i.agendamento_id = ?`;
        
    db.all(sql, [id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Inicialização na Porta 3000
app.listen(3000, () => {
    console.log('====================================================');
    console.log('✨ EstéticaGlow - Servidor Rodando na Porta 3000!');
    console.log('📂 Banco de Dados: esteticaglow.db');
    console.log('====================================================');
});

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database("./bellavita.db");

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cpf TEXT UNIQUE,
            telefone TEXT NOT NULL,
            email TEXT,
            nascimento TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS servicos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            categoria TEXT NOT NULL,
            preco REAL NOT NULL,
            duracao INTEGER NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            data TEXT NOT NULL,
            hora TEXT NOT NULL,
            profissional TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Agendado',
            observacoes TEXT,
            total REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (cliente_id)
                REFERENCES clientes(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS itens_agendamento (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agendamento_id INTEGER NOT NULL,
            servico_id INTEGER NOT NULL,
            preco REAL NOT NULL,
            FOREIGN KEY (agendamento_id)
                REFERENCES agendamentos(id),
            FOREIGN KEY (servico_id)
                REFERENCES servicos(id)
        )
    `);
});


/* =========================================================
   CLIENTES
========================================================= */

app.post("/api/clientes", (req, res) => {

    const {
        nome,
        cpf,
        telefone,
        email,
        nascimento
    } = req.body;

    if (!nome || !telefone) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "Nome e telefone são obrigatórios."
        });
    }

    const sql = `
        INSERT INTO clientes
        (nome, cpf, telefone, email, nascimento)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.run(
        sql,
        [
            nome,
            cpf || null,
            telefone,
            email || null,
            nascimento || null
        ],
        function (erro) {

            if (erro) {

                return res.status(400).json({
                    sucesso: false,
                    mensagem: erro.message
                });

            }

            res.json({
                sucesso: true,
                id: this.lastID
            });

        }
    );
});


app.get("/api/clientes", (req, res) => {

    db.all(
        `
        SELECT *
        FROM clientes
        ORDER BY nome ASC
        `,
        [],
        (erro, clientes) => {

            if (erro) {
                return res.status(500).json({
                    erro: erro.message
                });
            }

            res.json(clientes);

        }
    );

});


app.delete("/api/clientes/:id", (req, res) => {

    const id = req.params.id;

    db.run(
        "DELETE FROM clientes WHERE id = ?",
        [id],
        function (erro) {

            if (erro) {
                return res.status(500).json({
                    sucesso: false,
                    mensagem: erro.message
                });
            }

            res.json({
                sucesso: true
            });

        }
    );

});


/* =========================================================
   SERVIÇOS / PROCEDIMENTOS
========================================================= */

app.post("/api/servicos", (req, res) => {

    const {
        nome,
        categoria,
        preco,
        duracao
    } = req.body;

    if (!nome || !categoria || !preco || !duracao) {

        return res.status(400).json({
            sucesso: false,
            mensagem: "Preencha todos os campos."
        });

    }

    db.run(
        `
        INSERT INTO servicos
        (nome, categoria, preco, duracao)
        VALUES (?, ?, ?, ?)
        `,
        [
            nome,
            categoria,
            Number(preco),
            Number(duracao)
        ],
        function (erro) {

            if (erro) {

                return res.status(500).json({
                    sucesso: false,
                    mensagem: erro.message
                });

            }

            res.json({
                sucesso: true,
                id: this.lastID
            });

        }
    );

});


app.get("/api/servicos", (req, res) => {

    db.all(
        `
        SELECT *
        FROM servicos
        ORDER BY categoria, nome
        `,
        [],
        (erro, servicos) => {

            if (erro) {
                return res.status(500).json({
                    erro: erro.message
                });
            }

            res.json(servicos);

        }
    );

});


/* =========================================================
   AGENDAMENTOS
========================================================= */

app.post("/api/agendamentos", (req, res) => {

    const {
        cliente_id,
        data,
        hora,
        profissional,
        status,
        observacoes,
        servicos
    } = req.body;

    if (
        !cliente_id ||
        !data ||
        !hora ||
        !profissional ||
        !Array.isArray(servicos) ||
        servicos.length === 0
    ) {

        return res.status(400).json({
            sucesso: false,
            mensagem:
                "Cliente, data, horário, profissional e procedimento são obrigatórios."
        });

    }

    db.serialize(() => {

        db.run("BEGIN TRANSACTION");

        let total = 0;

        const ids = servicos.map(
            item => item.id
        );

        const placeholders =
            ids.map(() => "?").join(",");

        db.all(
            `
            SELECT id, preco
            FROM servicos
            WHERE id IN (${placeholders})
            `,
            ids,
            (erro, servicosBanco) => {

                if (erro) {

                    db.run("ROLLBACK");

                    return res.status(500).json({
                        sucesso: false,
                        mensagem: erro.message
                    });

                }

                if (
                    servicosBanco.length !==
                    ids.length
                ) {

                    db.run("ROLLBACK");

                    return res.status(400).json({
                        sucesso: false,
                        mensagem:
                            "Um ou mais procedimentos não existem."
                    });

                }

                servicosBanco.forEach(
                    servico => {
                        total += Number(
                            servico.preco
                        );
                    }
                );


                db.run(
                    `
                    INSERT INTO agendamentos
                    (
                        cliente_id,
                        data,
                        hora,
                        profissional,
                        status,
                        observacoes,
                        total
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    `,
                    [
                        cliente_id,
                        data,
                        hora,
                        profissional,
                        status || "Agendado",
                        observacoes || "",
                        total
                    ],
                    function (erro) {

                        if (erro) {

                            db.run("ROLLBACK");

                            return res.status(500).json({
                                sucesso: false,
                                mensagem: erro.message
                            });

                        }

                        const agendamentoId =
                            this.lastID;

                        const stmt =
                            db.prepare(`
                                INSERT INTO
                                itens_agendamento
                                (
                                    agendamento_id,
                                    servico_id,
                                    preco
                                )
                                VALUES (?, ?, ?)
                            `);

                        let erroItem = null;

                        servicosBanco.forEach(
                            servico => {

                                stmt.run(
                                    [
                                        agendamentoId,
                                        servico.id,
                                        servico.preco
                                    ],
                                    erro => {

                                        if (erro) {
                                            erroItem =
                                                erro;
                                        }

                                    }
                                );

                            }
                        );

                        stmt.finalize(() => {

                            if (erroItem) {

                                db.run("ROLLBACK");

                                return res.status(500).json({
                                    sucesso: false,
                                    mensagem:
                                        erroItem.message
                                });

                            }

                            db.run(
                                "COMMIT",
                                erroCommit => {

                                    if (erroCommit) {

                                        return res.status(500).json({
                                            sucesso: false,
                                            mensagem:
                                                erroCommit.message
                                        });

                                    }

                                    res.json({
                                        sucesso: true,
                                        id: agendamentoId,
                                        total
                                    });

                                }
                            );

                        });

                    }
                );

            }
        );

    });

});


/* =========================================================
   LISTAR AGENDAMENTOS
========================================================= */

app.get("/api/agendamentos", (req, res) => {

    const sql = `
        SELECT
            a.id,
            a.data,
            a.hora,
            a.profissional,
            a.status,
            a.observacoes,
            a.total,
            c.nome AS cliente
        FROM agendamentos a
        INNER JOIN clientes c
            ON c.id = a.cliente_id
        ORDER BY
            a.data ASC,
            a.hora ASC
    `;

    db.all(
        sql,
        [],
        (erro, agendamentos) => {

            if (erro) {

                return res.status(500).json({
                    erro: erro.message
                });

            }

            res.json(agendamentos);

        }
    );

});


/* =========================================================
   DETALHES DO AGENDAMENTO
========================================================= */

app.get(
    "/api/agendamentos/:id",
    (req, res) => {

        const id = req.params.id;

        const sql = `
            SELECT
                i.id,
                s.nome,
                s.categoria,
                s.duracao,
                i.preco
            FROM itens_agendamento i
            INNER JOIN servicos s
                ON s.id = i.servico_id
            WHERE i.agendamento_id = ?
        `;

        db.all(
            sql,
            [id],
            (erro, itens) => {

                if (erro) {

                    return res.status(500).json({
                        erro: erro.message
                    });

                }

                res.json(itens);

            }
        );

    }
);


/* =========================================================
   ALTERAR STATUS
========================================================= */

app.put(
    "/api/agendamentos/:id/status",
    (req, res) => {

        const id = req.params.id;

        const {
            status
        } = req.body;

        const permitidos = [
            "Agendado",
            "Confirmado",
            "Concluído",
            "Cancelado"
        ];

        if (!permitidos.includes(status)) {

            return res.status(400).json({
                sucesso: false,
                mensagem: "Status inválido."
            });

        }

        db.run(
            `
            UPDATE agendamentos
            SET status = ?
            WHERE id = ?
            `,
            [
                status,
                id
            ],
            erro => {

                if (erro) {

                    return res.status(500).json({
                        sucesso: false,
                        mensagem: erro.message
                    });

                }

                res.json({
                    sucesso: true
                });

            }
        );

    }
);


/* =========================================================
   EXCLUIR AGENDAMENTO
========================================================= */

app.delete(
    "/api/agendamentos/:id",
    (req, res) => {

        const id = req.params.id;

        db.serialize(() => {

            db.run(
                `
                DELETE FROM itens_agendamento
                WHERE agendamento_id = ?
                `,
                [id]
            );

            db.run(
                `
                DELETE FROM agendamentos
                WHERE id = ?
                `,
                [id],
                erro => {

                    if (erro) {

                        return res.status(500).json({
                            sucesso: false,
                            mensagem: erro.message
                        });

                    }

                    res.json({
                        sucesso: true
                    });

                }
            );

        });

    }
);


/* =========================================================
   DASHBOARD
========================================================= */

app.get("/api/dashboard", (req, res) => {

    const resultado = {};

    db.get(
        "SELECT COUNT(*) AS total FROM clientes",
        [],
        (erro, row) => {

            if (erro) {
                return res.status(500).json({
                    erro: erro.message
                });
            }

            resultado.clientes = row.total;

            db.get(
                "SELECT COUNT(*) AS total FROM agendamentos",
                [],
                (erro, row) => {

                    if (erro) {
                        return res.status(500).json({
                            erro: erro.message
                        });
                    }

                    resultado.agendamentos =
                        row.total;

                    db.get(
                        `
                        SELECT COUNT(*) AS total
                        FROM agendamentos
                        WHERE status = 'Confirmado'
                        `,
                        [],
                        (erro, row) => {

                            if (erro) {
                                return res.status(500).json({
                                    erro: erro.message
                                });
                            }

                            resultado.confirmados =
                                row.total;

                            const hoje =
                                new Date()
                                .toISOString()
                                .split("T")[0];

                            db.get(
                                `
                                SELECT COUNT(*) AS total
                                FROM agendamentos
                                WHERE data = ?
                                `,
                                [hoje],
                                (erro, row) => {

                                    if (erro) {
                                        return res.status(500).json({
                                            erro: erro.message
                                        });
                                    }

                                    resultado.hoje =
                                        row.total;

                                    res.json(
                                        resultado
                                    );

                                }
                            );

                        }
                    );

                }
            );

        }
    );

});


/* =========================================================
   SERVIDOR
========================================================= */

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "=============================================="
        );
        console.log(
            "✨ BELLA VITA - CLÍNICA DE ESTÉTICA"
        );
        console.log(
            `🚀 Servidor: http://localhost:${PORT}`
        );
        console.log(
            "💾 Banco: bellavita.db"
        );
        console.log(
            "=============================================="
        );
        console.log("");

    }
);

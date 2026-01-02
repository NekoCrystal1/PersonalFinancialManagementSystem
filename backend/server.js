// server.js - SQL Server版本
// 第一部分：引入所需的模块
const express = require('express');  // 引入Express框架
const cors = require('cors');        // 引入跨域支持
const path = require('path');        // 路径处理模块

// 引入数据库配置
const db = require('./dbConfig');

// 第二部分：创建Express应用实例
const app = express();

// 第三部分：配置中间件（Middleware）
app.use(cors());                     // 允许跨域请求
app.use(express.json());             // 解析JSON请求体

// 第四部分：声明全局数据库连接池
let pool;

// 第五部分：初始化数据库连接
async function initializeDatabase() {
    try {
        // 1. 创建数据库（如果不存在）
        await db.createDatabaseIfNotExists();
        
        // 2. 连接到数据库
        pool = await db.connectToDatabase();
        
        // 3. 创建数据表
        await db.createTables(pool);
        
        // 4. 初始化默认数据
        await db.initializeDefaultCategories(pool);
        
        console.log('📊 数据库初始化完成');
    } catch (err) {
        console.error('❌ 数据库初始化失败:', err.message);
        process.exit(1); // 退出进程
    }
}

// 第六部分：定义路由（API接口）
// 1. 测试接口 - 验证服务器和数据库连接
app.get('/api/test', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT @@VERSION as version');
        res.json({ 
            message: '后端服务器和SQL Server数据库正常运行！', 
            sqlServerVersion: result.recordset[0].version,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: '数据库查询失败', details: err.message });
    }
});

// 2. 获取所有交易记录
app.get('/api/transactions', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT * FROM transactions ORDER BY date DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: '获取交易记录失败', details: err.message });
    }
});

// 3. 添加新的交易记录
app.post('/api/transactions', async (req, res) => {
    try {
        const { date, type, category, amount, description } = req.body;
        
        // 验证必需字段
        if (!date || !type || !amount) {
            return res.status(400).json({ error: '缺少必需字段: date, type, amount' });
        }
        
        const result = await pool.request()
            .input('date', db.sql.Date, date)
            .input('type', db.sql.VarChar, type)
            .input('category', db.sql.VarChar, category || '其他')
            .input('amount', db.sql.Decimal(10, 2), parseFloat(amount))
            .input('description', db.sql.VarChar, description || '')
            .query(`
                INSERT INTO transactions (date, type, category, amount, description) 
                VALUES (@date, @type, @category, @amount, @description);
                SELECT SCOPE_IDENTITY() as id;
            `);
        
        // 返回新创建的记录
        const newRecord = await pool.request()
            .input('id', db.sql.Int, result.recordset[0].id)
            .query('SELECT * FROM transactions WHERE id = @id');
        
        res.status(201).json(newRecord.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: '添加交易记录失败', details: err.message });
    }
});

// 4. 获取分类列表
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.request().query('SELECT * FROM categories ORDER BY type, name');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: '获取分类列表失败', details: err.message });
    }
});

// 5. 获取月度统计
app.get('/api/summary/:year/:month', async (req, res) => {
    try {
        const { year, month } = req.params;
        const startDate = `${year}-${month.padStart(2, '0')}-01`;
        const endDate = `${year}-${month.padStart(2, '0')}-31`;
        
        const result = await pool.request()
            .input('startDate', db.sql.Date, startDate)
            .input('endDate', db.sql.Date, endDate)
            .query(`
                SELECT 
                    type,
                    category,
                    SUM(amount) as total_amount,
                    COUNT(*) as count
                FROM transactions
                WHERE date BETWEEN @startDate AND @endDate
                GROUP BY type, category
                ORDER BY type, total_amount DESC
            `);
        
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: '获取统计信息失败', details: err.message });
    }
});

// 6. 删除交易记录
app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.request()
            .input('id', db.sql.Int, id)
            .query('DELETE FROM transactions WHERE id = @id');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: '记录不存在' });
        }
        
        res.json({ success: true, message: '记录删除成功', id: parseInt(id) });
    } catch (err) {
        res.status(500).json({ error: '删除记录失败', details: err.message });
    }
});

// 7. 更新交易记录
app.put('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { date, type, category, amount, description } = req.body;
        
        // 验证必需字段
        if (!date || !type || !amount) {
            return res.status(400).json({ error: '缺少必需字段: date, type, amount' });
        }
        
        const result = await pool.request()
            .input('id', db.sql.Int, id)
            .input('date', db.sql.Date, date)
            .input('type', db.sql.VarChar, type)
            .input('category', db.sql.VarChar, category || '其他')
            .input('amount', db.sql.Decimal(10, 2), parseFloat(amount))
            .input('description', db.sql.VarChar, description || '')
            .query(`
                UPDATE transactions 
                SET date = @date, 
                    type = @type, 
                    category = @category, 
                    amount = @amount, 
                    description = @description,
                    created_at = GETDATE()
                WHERE id = @id;
                
                SELECT * FROM transactions WHERE id = @id;
            `);
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: '记录不存在' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: '更新记录失败', details: err.message });
    }
});

// 8. 获取单条记录
app.get('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.request()
            .input('id', db.sql.Int, id)
            .query('SELECT * FROM transactions WHERE id = @id');
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: '记录不存在' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: '获取记录失败', details: err.message });
    }
});

// ==================== 预算管理API ====================

// 1. 获取预算列表
app.get('/api/budgets', async (req, res) => {
    try {
        const { month } = req.query;
        
        let query = `
            SELECT 
                b.id,
                b.category_id,
                c.name as category_name,
                c.icon as category_icon,
                b.month,
                b.amount,
                b.created_at,
                b.updated_at
            FROM budgets b
            LEFT JOIN categories c ON b.category_id = c.id
        `;
        
        if (month) {
            query += ` WHERE b.month = @month`;
        }
        
        query += ` ORDER BY b.month DESC, c.name`;
        
        const request = pool.request();
        if (month) {
            request.input('month', db.sql.VarChar, month);
        }
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: '获取预算列表失败', details: err.message });
    }
});

// 2. 添加或更新预算
app.post('/api/budgets', async (req, res) => {
    try {
        const { category_id, month, amount } = req.body;
        
        if (!month || !amount || amount <= 0) {
            return res.status(400).json({ error: '缺少必需字段: month, amount' });
        }
        
        // 检查是否已存在相同月份和分类的预算
        const checkResult = await pool.request()
            .input('category_id', category_id ? db.sql.Int : db.sql.NVarChar, category_id)
            .input('month', db.sql.VarChar, month)
            .query('SELECT id FROM budgets WHERE category_id = @category_id AND month = @month');
        
        let result;
        if (checkResult.recordset.length > 0) {
            // 更新现有预算
            result = await pool.request()
                .input('id', db.sql.Int, checkResult.recordset[0].id)
                .input('amount', db.sql.Decimal(10, 2), parseFloat(amount))
                .query(`
                    UPDATE budgets 
                    SET amount = @amount, updated_at = GETDATE()
                    WHERE id = @id;
                    
                    SELECT * FROM budgets WHERE id = @id;
                `);
        } else {
            // 添加新预算
            result = await pool.request()
                .input('category_id', category_id ? db.sql.Int : db.sql.NVarChar, category_id)
                .input('month', db.sql.VarChar, month)
                .input('amount', db.sql.Decimal(10, 2), parseFloat(amount))
                .query(`
                    INSERT INTO budgets (category_id, month, amount) 
                    VALUES (@category_id, @month, @amount);
                    
                    SELECT SCOPE_IDENTITY() as id;
                `);
        }
        
        // 返回完整的预算信息
        const budgetId = result.recordset[0].id;
        const budgetResult = await pool.request()
            .input('id', db.sql.Int, budgetId)
            .query(`
                SELECT 
                    b.id,
                    b.category_id,
                    c.name as category_name,
                    c.icon as category_icon,
                    b.month,
                    b.amount,
                    b.created_at,
                    b.updated_at
                FROM budgets b
                LEFT JOIN categories c ON b.category_id = c.id
                WHERE b.id = @id
            `);
        
        res.status(201).json(budgetResult.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: '保存预算失败', details: err.message });
    }
});

// 3. 删除预算
app.delete('/api/budgets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.request()
            .input('id', db.sql.Int, id)
            .query('DELETE FROM budgets WHERE id = @id');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: '预算不存在' });
        }
        
        res.json({ success: true, message: '预算删除成功', id: parseInt(id) });
    } catch (err) {
        res.status(500).json({ error: '删除预算失败', details: err.message });
    }
});

// 4. 获取预算使用情况统计
app.get('/api/budgets/summary/:month', async (req, res) => {
    try {
        const { month } = req.params;
        
        // 获取当月所有支出分类的预算和实际支出
        const result = await pool.request()
            .input('month', db.sql.VarChar, month)
            .query(`
                SELECT 
                    c.id as category_id,
                    c.name as category_name,
                    c.icon as category_icon,
                    ISNULL(b.amount, 0) as budget_amount,
                    ISNULL(SUM(t.amount), 0) as actual_amount,
                    CASE 
                        WHEN ISNULL(b.amount, 0) = 0 THEN 0
                        ELSE (ISNULL(SUM(t.amount), 0) / b.amount) * 100
                    END as usage_percentage
                FROM categories c
                LEFT JOIN budgets b ON c.id = b.category_id AND b.month = @month
                LEFT JOIN transactions t ON c.id = t.category 
                    AND t.type = 'expense' 
                    AND FORMAT(t.date, 'yyyy-MM') = @month
                WHERE c.type = 'expense'
                GROUP BY c.id, c.name, c.icon, b.amount
                ORDER BY usage_percentage DESC, c.name
            `);
        
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: '获取预算统计失败', details: err.message });
    }
});

// 第七部分：错误处理中间件
app.use((err, req, res, next) => {
    console.error('❌ 服务器错误:', err.stack);
    res.status(500).json({ error: '服务器内部错误', message: err.message });
});

// 第八部分：启动服务器
async function startServer() {
    try {
        // 初始化数据库
        await initializeDatabase();
        
        // 设置服务器端口
        const PORT = process.env.SERVER_PORT || 3000;
        
        // 启动Express服务器
        app.listen(PORT, () => {
            console.log(`🚀 服务器正在运行：http://localhost:${PORT}`);
            console.log(`📊 数据库：${process.env.DB_DATABASE} @ ${process.env.DB_SERVER}`);
            console.log(`📁 测试API：http://localhost:${PORT}/api/test`);
        });
    } catch (err) {
        console.error('❌ 启动服务器失败:', err.message);
        process.exit(1);
    }
}

// 第九部分：优雅关闭
process.on('SIGINT', async () => {
    console.log('\n🛑 正在关闭服务器...');
    if (pool) {
        await pool.close();
        console.log('📦 数据库连接已关闭');
    }
    process.exit(0);
});

// 启动服务器
startServer();
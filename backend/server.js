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
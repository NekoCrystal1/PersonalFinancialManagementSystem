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

// ==================== 新增：用户认证相关 ====================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// JWT配置
const JWT_SECRET = process.env.JWT_SECRET || 'finance-app-secret-key-2024';
const JWT_EXPIRES_IN = '7d'; // token有效期7天

// ==================== 用户认证中间件 ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        // 对于某些API，如果没有token，使用默认用户（ID=1）
        req.user = { id: 1, username: 'guest' };
        return next();
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '访问令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
}

// ==================== 用户认证API ====================

// 1. 用户登录
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码为必填项' });
        }
        
        // 查找用户（支持用户名或邮箱登录）
        const result = await pool.request()
            .input('username', db.sql.VarChar, username)
            .query(`
                SELECT id, username, email, password_hash, is_active 
                FROM users 
                WHERE username = @username OR email = @username
            `);
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        const user = result.recordset[0];
        
        // 检查用户是否激活
        if (!user.is_active) {
            return res.status(403).json({ error: '账户已被禁用' });
        }
        
        // 简单密码验证（MD5，仅用于演示）
        const md5 = require('crypto').createHash('md5');
        const passwordHash = md5.update(password).digest('hex');
        
        if (passwordHash !== user.password_hash) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        // 生成JWT token
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username,
                email: user.email
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.json({
            success: true,
            message: '登录成功',
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            token
        });
        
    } catch (err) {
        console.error('❌ 用户登录失败:', err.message);
        res.status(500).json({ error: '登录失败', details: err.message });
    }
});

// 2. 用户注册（简化版）
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // 验证输入
        if (!username || !email || !password) {
            return res.status(400).json({ error: '用户名、邮箱和密码为必填项' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6位' });
        }
        
        // 检查用户是否已存在
        const userCheck = await pool.request()
            .input('username', db.sql.VarChar, username)
            .input('email', db.sql.VarChar, email)
            .query('SELECT id FROM users WHERE username = @username OR email = @email');
        
        if (userCheck.recordset.length > 0) {
            return res.status(409).json({ error: '用户名或邮箱已存在' });
        }
        
        // 密码加密（MD5，仅用于演示）
        const md5 = require('crypto').createHash('md5');
        const passwordHash = md5.update(password).digest('hex');
        
        // 创建用户
        const result = await pool.request()
            .input('username', db.sql.VarChar, username)
            .input('email', db.sql.VarChar, email)
            .input('password_hash', db.sql.VarChar, passwordHash)
            .query(`
                INSERT INTO users (username, email, password_hash) 
                VALUES (@username, @email, @password_hash);
                
                SELECT id, username, email, created_at 
                FROM users WHERE id = SCOPE_IDENTITY();
            `);
        
        const newUser = result.recordset[0];
        
        // 生成JWT token
        const token = jwt.sign(
            { 
                id: newUser.id, 
                username: newUser.username,
                email: newUser.email
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.status(201).json({
            success: true,
            message: '注册成功',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email
            },
            token
        });
        
    } catch (err) {
        console.error('❌ 用户注册失败:', err.message);
        res.status(500).json({ error: '注册失败', details: err.message });
    }
});

// 3. 获取当前用户信息
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.request()
            .input('id', db.sql.Int, req.user.id)
            .query(`
                SELECT id, username, email, created_at 
                FROM users WHERE id = @id
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('❌ 获取用户信息失败:', err.message);
        res.status(500).json({ error: '获取用户信息失败', details: err.message });
    }
});

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
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const result = await pool.request()
            .input('user_id', db.sql.Int, req.user.id)
            .query(`
                SELECT 
                    t.id,
                    t.date,
                    t.type,
                    t.category,
                    c.name as category_name,
                    c.icon as category_icon,
                    t.amount,
                    t.description,
                    t.created_at
                FROM transactions t
                LEFT JOIN categories c ON t.category = c.id
                WHERE t.user_id = @user_id
                ORDER BY t.date DESC
            `);
        
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: '获取交易记录失败', details: err.message });
    }
});

// 3. 添加新的交易记录
app.post('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { date, type, category, amount, description } = req.body;
        const userId = req.user.id;
        
        // 验证必需字段
        if (!date || !type || !amount) {
            return res.status(400).json({ error: '缺少必需字段: date, type, amount' });
        }
        
        // 如果category是分类名称而不是ID，先查找或创建
        let categoryId = category;
        if (category && isNaN(category)) {
            const catResult = await pool.request()
                .input('name', db.sql.VarChar, category)
                .query('SELECT id FROM categories WHERE name = @name');
            
            if (catResult.recordset.length > 0) {
                categoryId = catResult.recordset[0].id;
            }
        }
        
        const result = await pool.request()
            .input('date', db.sql.Date, date)
            .input('type', db.sql.VarChar, type)
            .input('category', categoryId ? db.sql.Int : db.sql.NVarChar, categoryId)
            .input('amount', db.sql.Decimal(10, 2), parseFloat(amount))
            .input('description', db.sql.VarChar, description || '')
            .input('user_id', db.sql.Int, userId)
            .query(`
                INSERT INTO transactions (date, type, category, amount, description, user_id) 
                VALUES (@date, @type, @category, @amount, @description, @user_id);
                
                SELECT 
                    t.id,
                    t.date,
                    t.type,
                    t.category,
                    c.name as category_name,
                    c.icon as category_icon,
                    t.amount,
                    t.description,
                    t.created_at
                FROM transactions t
                LEFT JOIN categories c ON t.category = c.id
                WHERE t.id = SCOPE_IDENTITY();
            `);
        
        res.status(201).json(result.recordset[0]);
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
app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        const result = await pool.request()
            .input('id', db.sql.Int, id)
            .input('user_id', db.sql.Int, userId)
            .query('DELETE FROM transactions WHERE id = @id AND user_id = @user_id');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: '记录不存在或无权限删除' });
        }
        
        res.json({ success: true, message: '记录删除成功', id: parseInt(id) });
    } catch (err) {
        res.status(500).json({ error: '删除记录失败', details: err.message });
    }
});

// 7. 更新交易记录
app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
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
app.get('/api/transactions/:id', authenticateToken, async (req, res) => {
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
app.get('/api/budgets', authenticateToken, async (req, res) => {
    try {
        const { month } = req.query;
        const userId = req.user.id;
        
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
            WHERE b.user_id = @user_id
        `;
        
        if (month) {
            query += ` AND b.month = @month`;
        }
        
        query += ` ORDER BY b.month DESC, c.name`;
        
        const request = pool.request()
            .input('user_id', db.sql.Int, userId);
        
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
app.post('/api/budgets', authenticateToken, async (req, res) => {
    try {
        const { id, category_id, month, amount } = req.body;
        const userId = req.user.id;
        
        console.log('📝 收到预算请求:', { id, category_id, month, amount, userId });
        
        if (!month || !amount || amount <= 0) {
            return res.status(400).json({ error: '缺少必需字段: month, amount' });
        }
        
        // 如果提供了ID，直接更新
        if (id) {
            console.log(`🔄 更新现有预算 ID: ${id}`);
            
            const result = await pool.request()
                .input('id', db.sql.Int, id)
                .input('amount', db.sql.Decimal(10, 2), parseFloat(amount))
                .input('user_id', db.sql.Int, userId)
                .query(`
                    UPDATE budgets 
                    SET amount = @amount, updated_at = GETDATE()
                    WHERE id = @id AND user_id = @user_id;
                    
                    SELECT * FROM budgets WHERE id = @id;
                `);
            
            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ error: '预算不存在或无权限更新' });
            }
            
            const updatedBudget = await pool.request()
                .input('id', db.sql.Int, id)
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
            
            return res.status(200).json(updatedBudget.recordset[0]);
        }
        
        // 如果没有ID，检查是否已存在
        const checkResult = await pool.request()
            .input('category_id', category_id ? db.sql.Int : db.sql.NVarChar, category_id)
            .input('month', db.sql.VarChar, month)
            .input('user_id', db.sql.Int, userId)
            .query('SELECT id FROM budgets WHERE category_id = @category_id AND month = @month AND user_id = @user_id');
        
        if (checkResult.recordset.length > 0) {
            // 如果已存在，更新它
            const existingId = checkResult.recordset[0].id;
            console.log(`📝 发现现有预算 ID: ${existingId}，将进行更新`);
            
            const result = await pool.request()
                .input('id', db.sql.Int, existingId)
                .input('amount', db.sql.Decimal(10, 2), parseFloat(amount))
                .query(`
                    UPDATE budgets 
                    SET amount = @amount, updated_at = GETDATE()
                    WHERE id = @id;
                    
                    SELECT * FROM budgets WHERE id = @id;
                `);
            
            const updatedBudget = await pool.request()
                .input('id', db.sql.Int, existingId)
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
            
            return res.status(200).json(updatedBudget.recordset[0]);
        } else {
            // 如果不存在，创建新的
            console.log(`🆕 创建新预算`);
            
            const result = await pool.request()
                .input('category_id', category_id ? db.sql.Int : db.sql.NVarChar, category_id)
                .input('month', db.sql.VarChar, month)
                .input('amount', db.sql.Decimal(10, 2), parseFloat(amount))
                .input('user_id', db.sql.Int, userId)
                .query(`
                    INSERT INTO budgets (category_id, month, amount, user_id) 
                    VALUES (@category_id, @month, @amount, @user_id);
                    
                    SELECT SCOPE_IDENTITY() as id;
                `);
            
            const newBudgetId = result.recordset[0].id;
            
            const newBudget = await pool.request()
                .input('id', db.sql.Int, newBudgetId)
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
            
            return res.status(201).json(newBudget.recordset[0]);
        }
    } catch (err) {
        console.error('❌ 保存预算失败:', err.message);
        res.status(500).json({ error: '保存预算失败', details: err.message });
    }
});

// 3. 删除预算
app.delete('/api/budgets/:id', authenticateToken, async (req, res) => {
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
app.get('/api/budgets/summary/:month', authenticateToken, async (req, res) => {
    try {
        const { month } = req.params;
        const userId = req.user.id;
        
        const result = await pool.request()
            .input('month', db.sql.VarChar, month)
            .input('user_id', db.sql.Int, userId)
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
                    END as usage_percentage,
                    b.id as budget_id
                FROM categories c
                LEFT JOIN budgets b ON c.id = b.category_id AND b.month = @month AND b.user_id = @user_id
                LEFT JOIN transactions t ON c.id = t.category 
                    AND t.type = 'expense' 
                    AND FORMAT(t.date, 'yyyy-MM') = @month
                    AND t.user_id = @user_id
                WHERE c.type = 'expense'
                GROUP BY c.id, c.name, c.icon, b.amount, b.id
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
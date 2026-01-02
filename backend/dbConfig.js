// dbConfig.js
// 数据库配置模块
const sql = require('mssql');
require('dotenv').config(); // 加载环境变量

// 配置对象
const config = {
    user: process.env.DB_USER,           // SQL Server用户名
    password: process.env.DB_PASSWORD,   // SQL Server密码
    server: process.env.DB_SERVER,       // 服务器地址，如果是本地则用localhost
    database: process.env.DB_DATABASE,   // 数据库名
    port: parseInt(process.env.DB_PORT), // 端口，默认1433
    
    // 连接选项
    options: {
        encrypt: false,           // 如果使用Azure需要设为true
        trustServerCertificate: true, // 本地开发设为true
        enableArithAbort: true
    },
    
    // 连接池配置
    pool: {
        max: 10,                  // 最大连接数
        min: 0,                   // 最小连接数
        idleTimeoutMillis: 30000  // 空闲连接超时时间（毫秒）
    }
};

// 数据库连接函数
async function connectToDatabase() {
    try {
        const pool = await sql.connect(config);
        console.log('✅ 成功连接到SQL Server数据库');
        return pool;
    } catch (err) {
        console.error('❌ 数据库连接失败:', err.message);
        throw err;
    }
}

// 创建数据库（如果不存在）
async function createDatabaseIfNotExists() {
    try {
        // 首先连接到master数据库
        const masterConfig = {
            ...config,
            database: 'master'
        };
        
        const masterPool = await sql.connect(masterConfig);
        
        // 检查数据库是否存在
        const result = await masterPool.request()
            .query(`SELECT name FROM sys.databases WHERE name = '${config.database}'`);
        
        if (result.recordset.length === 0) {
            // 创建数据库
            console.log(`📦 创建数据库: ${config.database}`);
            await masterPool.request()
                .query(`CREATE DATABASE ${config.database}`);
            console.log('✅ 数据库创建成功');
        }
        
        await masterPool.close();
    } catch (err) {
        console.error('❌ 创建数据库时出错:', err.message);
        throw err;
    }
}

// 创建数据表
async function createTables(pool) {
    try {
        // 创建交易记录表
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='transactions' AND xtype='U')
            CREATE TABLE transactions (
                id INT IDENTITY(1,1) PRIMARY KEY,
                date DATE NOT NULL,
                type VARCHAR(10) CHECK (type IN ('income', 'expense')),
                category VARCHAR(50),
                amount DECIMAL(10, 2) NOT NULL,
                description VARCHAR(255),
                created_at DATETIME DEFAULT GETDATE()
            )
        `);
        console.log('✅ transactions表已就绪');
        
        // 创建分类表
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='categories' AND xtype='U')
            CREATE TABLE categories (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                type VARCHAR(10) CHECK (type IN ('income', 'expense')),
                icon VARCHAR(20)
            )
        `);
        console.log('✅ categories表已就绪');
        
        // 创建预算表
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='budgets' AND xtype='U')
            CREATE TABLE budgets (
                id INT IDENTITY(1,1) PRIMARY KEY,
                category_id INT,
                month VARCHAR(7) NOT NULL, -- 格式: YYYY-MM
                amount DECIMAL(10, 2) NOT NULL,
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE(),
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
            )
        `);
        console.log('✅ budgets表已就绪');

        return true;
    } catch (err) {
        console.error('❌ 创建表时出错:', err.message);
        throw err;
    }
}

// 初始化默认分类数据
async function initializeDefaultCategories(pool) {
    try {
        const defaultCategories = [
            // 收入分类
            { name: '工资', type: 'income', icon: '💼' },
            { name: '奖金', type: 'income', icon: '💰' },
            { name: '兼职', type: 'income', icon: '👨‍💻' },
            { name: '投资', type: 'income', icon: '📈' },
            // 支出分类
            { name: '餐饮', type: 'expense', icon: '🍽️' },
            { name: '交通', type: 'expense', icon: '🚗' },
            { name: '购物', type: 'expense', icon: '🛍️' },
            { name: '娱乐', type: 'expense', icon: '🎮' },
            { name: '学习', type: 'expense', icon: '📚' },
            { name: '住房', type: 'expense', icon: '🏠' },
            { name: '医疗', type: 'expense', icon: '🏥' },
            { name: '其他', type: 'expense', icon: '📦' }
        ];
        
        for (const category of defaultCategories) {
            // 使用MERGE语句插入或更新数据
            await pool.request()
                .input('name', sql.VarChar, category.name)
                .input('type', sql.VarChar, category.type)
                .input('icon', sql.VarChar, category.icon)
                .query(`
                    MERGE categories AS target
                    USING (SELECT @name AS name, @type AS type, @icon AS icon) AS source
                    ON (target.name = source.name)
                    WHEN NOT MATCHED THEN
                        INSERT (name, type, icon) VALUES (source.name, source.type, source.icon);
                `);
        }
        console.log('✅ 默认分类数据初始化完成');
    } catch (err) {
        console.error('❌ 初始化分类数据时出错:', err.message);
        throw err;
    }
}

module.exports = {
    config,
    connectToDatabase,
    createDatabaseIfNotExists,
    createTables,
    initializeDefaultCategories,
    sql
};
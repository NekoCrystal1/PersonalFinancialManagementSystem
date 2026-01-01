// script.js - 个人财务管理工具前端逻辑

// ==================== 全局变量 ====================
const API_BASE_URL = 'http://localhost:3000/api';
let allTransactions = [];  // 存储所有交易记录
let categories = [];       // 存储分类数据
let currentFilter = 'all'; // 当前筛选类型
let currentMonth = new Date().toISOString().slice(0, 7); // 当前月份 YYYY-MM

// ==================== DOM元素引用 ====================
// 表单相关
const addRecordForm = document.getElementById('add-record-form');
const dateInput = document.getElementById('date');
const typeSelect = document.getElementById('type');
const categorySelect = document.getElementById('category');
const amountInput = document.getElementById('amount');
const descriptionInput = document.getElementById('description');

// 统计卡片
const totalIncomeElement = document.getElementById('total-income');
const totalExpenseElement = document.getElementById('total-expense');
const totalBalanceElement = document.getElementById('total-balance');

// 表格相关
const recordsBody = document.getElementById('records-body');
const recordsTable = document.getElementById('records-table');
const noRecordsElement = document.getElementById('no-records');
const loadingRow = document.getElementById('loading-row');

// 筛选控件
const filterTypeSelect = document.getElementById('filter-type');
const filterMonthInput = document.getElementById('filter-month');

// ==================== 工具函数 ====================
// 1. 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// 2. 格式化金额
function formatAmount(amount) {
    return `¥${parseFloat(amount).toFixed(2)}`;
}

// 3. 获取分类名称（根据分类ID）
function getCategoryName(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : '其他';
}

// 4. 获取分类图标
function getCategoryIcon(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.icon : '📦';
}

// ==================== API调用函数 ====================
// 1. 获取所有交易记录
async function fetchTransactions() {
    try {
        console.log('📡 正在获取交易记录...');
        const response = await fetch(`${API_BASE_URL}/transactions`);
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }
        const data = await response.json();
        console.log(`✅ 获取到 ${data.length} 条记录`);
        return data;
    } catch (error) {
        console.error('❌ 获取交易记录失败:', error);
        showMessage('获取记录失败，请检查服务器连接', 'error');
        return [];
    }
}

// 2. 获取分类列表
async function fetchCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }
        const data = await response.json();
        console.log(`✅ 获取到 ${data.length} 个分类`);
        return data;
    } catch (error) {
        console.error('❌ 获取分类列表失败:', error);
        return [];
    }
}

// 3. 添加新记录
async function addTransaction(transactionData) {
    try {
        const response = await fetch(`${API_BASE_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transactionData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || `HTTP错误: ${response.status}`);
        }
        
        const newTransaction = await response.json();
        console.log('✅ 记录添加成功:', newTransaction);
        return newTransaction;
    } catch (error) {
        console.error('❌ 添加记录失败:', error);
        throw error;
    }
}

// ==================== 数据渲染函数 ====================
// 1. 更新统计卡片
function updateSummaryCards() {
    const currentMonthData = allTransactions.filter(record => {
        const recordMonth = record.date.slice(0, 7); // 获取YYYY-MM
        return recordMonth === currentMonth;
    });
    
    let totalIncome = 0;
    let totalExpense = 0;
    
    currentMonthData.forEach(record => {
        if (record.type === 'income') {
            totalIncome += parseFloat(record.amount);
        } else if (record.type === 'expense') {
            totalExpense += parseFloat(record.amount);
        }
    });
    
    const totalBalance = totalIncome - totalExpense;
    
    // 更新DOM元素
    totalIncomeElement.textContent = formatAmount(totalIncome);
    totalExpenseElement.textContent = formatAmount(totalExpense);
    totalBalanceElement.textContent = formatAmount(totalBalance);
    
    console.log(`📊 统计更新: 收入${totalIncome}, 支出${totalExpense}, 结余${totalBalance}`);
}

// 2. 渲染记录表格
function renderTransactions() {
    // 隐藏加载状态
    if (loadingRow) loadingRow.style.display = 'none';
    
    // 筛选数据
    let filteredTransactions = allTransactions;
    
    // 按类型筛选
    if (currentFilter !== 'all') {
        filteredTransactions = filteredTransactions.filter(
            record => record.type === currentFilter
        );
    }
    
    // 按月份筛选
    filteredTransactions = filteredTransactions.filter(record => {
        const recordMonth = record.date.slice(0, 7);
        return recordMonth === currentMonth;
    });
    
    // 清空表格
    recordsBody.innerHTML = '';
    
    // 检查是否有数据
    if (filteredTransactions.length === 0) {
        noRecordsElement.style.display = 'block';
        recordsTable.style.display = 'none';
        return;
    }
    
    // 显示表格
    noRecordsElement.style.display = 'none';
    recordsTable.style.display = 'table';
    
    // 添加数据行
    filteredTransactions.forEach(record => {
        const row = document.createElement('tr');
        row.dataset.id = record.id;
        
        const typeClass = record.type === 'income' ? 'type-income' : 'type-expense';
        const typeText = record.type === 'income' ? '收入' : '支出';
        const amountClass = record.type === 'income' ? 'amount-income' : 'amount-expense';
        
        row.innerHTML = `
            <td>${formatDate(record.date)}</td>
            <td><span class="type-badge ${typeClass}">${typeText}</span></td>
            <td>${getCategoryIcon(record.category)} ${getCategoryName(record.category)}</td>
            <td class="amount-cell ${amountClass}">${formatAmount(record.amount)}</td>
            <td>${record.description || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="editRecord(${record.id})">
                        <i class="fas fa-edit"></i> 编辑
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteRecord(${record.id})">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            </td>
        `;
        
        recordsBody.appendChild(row);
    });
    
    console.log(`📋 渲染了 ${filteredTransactions.length} 条记录`);
}

// 3. 更新分类下拉选项
function updateCategoryOptions() {
    const selectedType = typeSelect.value;
    
    // 清空现有选项
    categorySelect.innerHTML = '<option value="">请先选择类型</option>';
    
    if (!selectedType) return;
    
    // 根据类型筛选分类
    const filteredCategories = categories.filter(
        category => category.type === selectedType
    );
    
    // 添加选项
    filteredCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = `${category.icon} ${category.name}`;
        categorySelect.appendChild(option);
    });
    
    // 如果没有匹配的分类，添加默认选项
    if (filteredCategories.length === 0) {
        const defaultOption = document.createElement('option');
        defaultOption.value = '其他';
        defaultOption.textContent = '📦 其他';
        categorySelect.appendChild(defaultOption);
    }
}

// ==================== 事件处理函数 ====================
// 1. 表单提交处理
async function handleFormSubmit(event) {
    event.preventDefault();
    
    // 禁用提交按钮防止重复提交
    const submitButton = addRecordForm.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
    submitButton.disabled = true;
    
    try {
        // 收集表单数据
        const formData = {
            date: dateInput.value,
            type: typeSelect.value,
            category: categorySelect.value,
            amount: parseFloat(amountInput.value),
            description: descriptionInput.value.trim()
        };
        
        console.log('📝 提交表单数据:', formData);
        
        // 验证数据
        if (!formData.date || !formData.type || !formData.amount) {
            throw new Error('请填写所有必填字段');
        }
        
        if (formData.amount <= 0) {
            throw new Error('金额必须大于0');
        }
        
        // 发送到服务器
        const newRecord = await addTransaction(formData);
        
        // 添加到本地数据
        allTransactions.unshift(newRecord);
        
        // 更新UI
        updateSummaryCards();
        renderTransactions();
        
        // 重置表单
        addRecordForm.reset();
        updateCategoryOptions();
        
        // 设置默认日期为今天
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        
        // 显示成功消息
        showMessage('记录添加成功！', 'success');
        
    } catch (error) {
        console.error('❌ 表单提交失败:', error);
        showMessage(`提交失败: ${error.message}`, 'error');
    } finally {
        // 恢复提交按钮
        submitButton.innerHTML = originalText;
        submitButton.disabled = false;
    }
}

// 2. 筛选处理
function handleFilterChange() {
    currentFilter = filterTypeSelect.value;
    currentMonth = filterMonthInput.value;
    
    console.log(`🔍 筛选条件: 类型=${currentFilter}, 月份=${currentMonth}`);
    
    updateSummaryCards();
    renderTransactions();
}

// ==================== 辅助函数 ====================
// 显示消息
function showMessage(message, type = 'info') {
    // 创建消息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    // 添加到页面
    const container = document.querySelector('.container');
    container.insertBefore(messageDiv, container.firstChild);
    
    // 3秒后自动移除
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(-20px)';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// 添加消息样式（动态添加到页面）
function addMessageStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .message {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            transition: opacity 0.3s, transform 0.3s;
            min-width: 300px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        
        .message-success {
            background: linear-gradient(135deg, #2ecc71, #27ae60);
        }
        
        .message-error {
            background: linear-gradient(135deg, #e74c3c, #c0392b);
        }
        
        .message-info {
            background: linear-gradient(135deg, #3498db, #2980b9);
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// ==================== 初始化函数 ====================
async function initializeApp() {
    console.log('🚀 应用初始化开始...');
    
    // 添加消息样式
    addMessageStyles();
    
    // 设置默认日期为今天
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    filterMonthInput.value = currentMonth;
    
    try {
        // 1. 加载分类数据
        console.log('📂 正在加载分类数据...');
        categories = await fetchCategories();
        updateCategoryOptions();
        
        // 2. 加载交易记录
        console.log('📂 正在加载交易记录...');
        allTransactions = await fetchTransactions();
        
        // 3. 更新UI
        updateSummaryCards();
        renderTransactions();
        
        // 4. 显示成功消息
        showMessage('数据加载完成！', 'success');
        
        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        showMessage('初始化失败，请刷新页面重试', 'error');
    }
}

// ==================== 占位函数（后续实现） ====================
function editRecord(id) {
    showMessage('编辑功能将在下一步实现', 'info');
    console.log('📝 编辑记录:', id);
}

function deleteRecord(id) {
    showMessage('删除功能将在下一步实现', 'info');
    console.log('🗑️ 删除记录:', id);
}

// ==================== 事件监听器 ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM加载完成');
    
    // 初始化应用
    initializeApp();
    
    // 绑定事件
    addRecordForm.addEventListener('submit', handleFormSubmit);
    typeSelect.addEventListener('change', updateCategoryOptions);
    filterTypeSelect.addEventListener('change', handleFilterChange);
    filterMonthInput.addEventListener('change', handleFilterChange);
    
    // 显示测试消息
    setTimeout(() => {
        showMessage('个人财务管理工具已就绪！', 'success');
    }, 1000);
});
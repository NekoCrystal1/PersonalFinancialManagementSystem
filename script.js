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
    const category = categories.find(c => {
        return c.id == categoryId
    });
    return category ? category.name : '其他';
}

// 4. 获取分类图标
function getCategoryIcon(categoryId) {
    const category = categories.find(c => {
        return c.id == categoryId
    });
    return category ? category.icon : '📦';
}

/**更新UI */
function updateUI()
{
    updateSummaryCards();
    renderTransactions();
    updateCharts();
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

// ==================== 删除记录函数 ====================
async function deleteRecord(id) {
    if (!confirm('确定要删除这条记录吗？此操作不可撤销。')) {
        return;
    }
    
    try {
        console.log(`🗑️ 正在删除记录: ${id}`);
        
        const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '删除失败');
        }
        
        const result = await response.json();
        console.log('✅ 删除成功:', result);
        
        // 从本地数据中移除
        allTransactions = allTransactions.filter(record => record.id !== id);
        
        // 更新UI
        updateUI();
        
        // 显示成功消息
        showMessage('记录删除成功！', 'success');
        
    } catch (error) {
        console.error('❌ 删除记录失败:', error);
        showMessage(`删除失败: ${error.message}`, 'error');
    }
}

// ==================== 编辑记录功能 ====================
let editingId = null; // 当前正在编辑的记录ID

// 1. 加载记录到表单
async function loadRecordForEdit(id) {
    try {
        console.log(`📝 正在加载记录 ${id} 用于编辑`);
        
        const response = await fetch(`${API_BASE_URL}/transactions/${id}`);
        if (!response.ok) {
            throw new Error('获取记录失败');
        }
        
        const record = await response.json();
        
        // 填充表单
        dateInput.value = record.date;
        typeSelect.value = record.type;
        
        // 更新分类选项
        updateCategoryOptions();
        
        // 设置分类（需要等待分类选项更新）
        setTimeout(() => {
            categorySelect.value = record.category;
            amountInput.value = record.amount;
            descriptionInput.value = record.description || '';
            
            // 更新提交按钮文本
            const submitButton = addRecordForm.querySelector('button[type="submit"]');
            submitButton.innerHTML = '<i class="fas fa-save"></i> 更新记录';
            
            // 添加取消编辑按钮
            if (!document.getElementById('cancel-edit-btn')) {
                const cancelBtn = document.createElement('button');
                cancelBtn.id = 'cancel-edit-btn';
                cancelBtn.type = 'button';
                cancelBtn.className = 'btn-cancel';
                cancelBtn.innerHTML = '<i class="fas fa-times"></i> 取消编辑';
                cancelBtn.onclick = cancelEdit;
                
                addRecordForm.appendChild(cancelBtn);
            }
        }, 100);
        
        // 设置正在编辑的ID
        editingId = id;
        
        // 滚动到表单
        addRecordForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        showMessage(`正在编辑记录 #${id}`, 'info');
        
    } catch (error) {
        console.error('❌ 加载编辑记录失败:', error);
        showMessage(`加载记录失败: ${error.message}`, 'error');
    }
}

// 2. 取消编辑
function cancelEdit() {
    editingId = null;
    
    // 重置表单
    addRecordForm.reset();
    
    // 恢复默认日期
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    
    // 恢复提交按钮文本
    const submitButton = addRecordForm.querySelector('button[type="submit"]');
    submitButton.innerHTML = '<i class="fas fa-save"></i> 保存记录';
    
    // 移除取消按钮
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.remove();
    
    // 更新分类选项
    updateCategoryOptions();
    
    showMessage('已取消编辑', 'info');
}

// 3. 修改表单提交处理函数

// 4. 修改editRecord函数
function editRecord(id) {
    loadRecordForEdit(id);
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
    // 更新图表（因为筛选可能影响数据）
    updateCharts();
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
    
    const submitButton = addRecordForm.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
    submitButton.disabled = true;
    
    try {
        const formData = {
            date: dateInput.value,
            type: typeSelect.value,
            category: categorySelect.value,
            amount: parseFloat(amountInput.value),
            description: descriptionInput.value.trim()
        };
        
        // 验证数据
        if (!formData.date || !formData.type || !formData.amount) {
            throw new Error('请填写所有必填字段');
        }
        
        if (formData.amount <= 0) {
            throw new Error('金额必须大于0');
        }
        
        let updatedRecord;
        
        if (editingId) {
            // 更新现有记录
            console.log(`🔄 正在更新记录: ${editingId}`);
            
            const response = await fetch(`${API_BASE_URL}/transactions/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || '更新失败');
            }
            
            updatedRecord = await response.json();
            
            // 更新本地数据
            const index = allTransactions.findIndex(r => r.id === editingId);
            if (index !== -1) {
                allTransactions[index] = updatedRecord;
            }
            
            showMessage('记录更新成功！', 'success');
            
        } else {
            // 添加新记录
            console.log('📝 正在添加新记录');
            
            const response = await fetch(`${API_BASE_URL}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || '添加失败');
            }
            
            updatedRecord = await response.json();
            allTransactions.unshift(updatedRecord);
            
            showMessage('记录添加成功！', 'success');
        }
        
        // 更新UI
        updateUI();
        
        // 重置表单
        addRecordForm.reset();
        updateCategoryOptions();
        
        // 恢复默认日期
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        
        // 取消编辑状态
        if (editingId) {
            cancelEdit();
        }
        
    } catch (error) {
        console.error('❌ 表单提交失败:', error);
        showMessage(`提交失败: ${error.message}`, 'error');
    } finally {
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
        // 4. 更新图表
        updateUI();
        
        // 5. 显示成功消息
        showMessage('数据加载完成！', 'success');
        
        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        showMessage('初始化失败，请刷新页面重试', 'error');
    }
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

// ==================== 图表相关功能 ====================
let pieChart = null;
let barChart = null;

// 1. 初始化饼图（收支比例）
function initPieChart(income, expense) {
    const ctx = document.getElementById('pie-chart').getContext('2d');
    
    // 销毁旧图表
    if (pieChart) {
        pieChart.destroy();
    }
    
    const data = {
        labels: ['收入', '支出'],
        datasets: [{
            data: [income, expense],
            backgroundColor: [
                'rgba(46, 204, 113, 0.8)',  // 收入 - 绿色
                'rgba(231, 76, 60, 0.8)'    // 支出 - 红色
            ],
            borderColor: [
                'rgba(46, 204, 113, 1)',
                'rgba(231, 76, 60, 1)'
            ],
            borderWidth: 1,
            hoverOffset: 15
        }]
    };
    
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                display: false // 我们自定义图例
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.raw || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = Math.round((value / total) * 100);
                        return `${label}: ¥${value.toFixed(2)} (${percentage}%)`;
                    }
                }
            }
        }
    };
    
    pieChart = new Chart(ctx, {
        type: 'pie',
        data: data,
        options: options
    });
    
    // 更新自定义图例
    updatePieChartLegend(income, expense);
}

// 2. 更新饼图图例
function updatePieChartLegend(income, expense) {
    const legendContainer = document.getElementById('pie-chart-legend');
    const total = income + expense;
    
    const legendHtml = `
        <div class="legend-item">
            <div class="legend-color" style="background-color: rgba(46, 204, 113, 0.8)"></div>
            <span class="legend-label">收入</span>
            <span class="legend-value">¥${income.toFixed(2)} (${total > 0 ? Math.round((income / total) * 100) : 0}%)</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: rgba(231, 76, 60, 0.8)"></div>
            <span class="legend-label">支出</span>
            <span class="legend-value">¥${expense.toFixed(2)} (${total > 0 ? Math.round((expense / total) * 100) : 0}%)</span>
        </div>
    `;
    
    legendContainer.innerHTML = legendHtml;
}

// 3. 初始化柱状图（分类支出）
function initBarChart(monthData = null) {
    const ctx = document.getElementById('bar-chart').getContext('2d');
    
    // 销毁旧图表
    if (barChart) {
        barChart.destroy();
    }
    
    // 获取当前月份的支出数据
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthToShow = monthData || currentMonth;
    
    const monthExpenses = allTransactions.filter(record => 
        record.type === 'expense' && 
        record.date.slice(0, 7) === monthToShow
    );
    
    // 按分类分组
    const categoriesMap = {};
    monthExpenses.forEach(record => {
        const categoryName = getCategoryName(record.category);
        if (!categoriesMap[categoryName]) {
            categoriesMap[categoryName] = 0;
        }
        categoriesMap[categoryName] += parseFloat(record.amount);
    });
    
    const categories = Object.keys(categoriesMap);
    const amounts = Object.values(categoriesMap);
    
    // 如果没有数据，显示空图表
    if (categories.length === 0) {
        categories.push('暂无数据');
        amounts.push(1);
    }
    
    // 生成颜色
    const backgroundColors = categories.map((_, index) => {
        const hue = (index * 137.5) % 360; // 黄金角度，确保颜色分布均匀
        return `hsla(${hue}, 70%, 60%, 0.8)`;
    });
    
    const data = {
        labels: categories,
        datasets: [{
            label: '支出金额 (¥)',
            data: amounts,
            backgroundColor: backgroundColors,
            borderColor: backgroundColors.map(color => color.replace('0.8', '1')),
            borderWidth: 1,
            borderRadius: 5
        }]
    };
    
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return `${context.label}: ¥${context.raw.toFixed(2)}`;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function(value) {
                        return '¥' + value;
                    }
                }
            }
        }
    };
    
    barChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: options
    });
}

// 4. 更新图表数据
function updateCharts() {
    // 获取当前月份的数据
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthData = allTransactions.filter(record => 
        record.date.slice(0, 7) === currentMonth
    );
    
    let totalIncome = 0;
    let totalExpense = 0;
    
    monthData.forEach(record => {
        if (record.type === 'income') {
            totalIncome += parseFloat(record.amount);
        } else {
            totalExpense += parseFloat(record.amount);
        }
    });
    
    // 更新饼图
    initPieChart(totalIncome, totalExpense);
    
    // 更新柱状图
    initBarChart(currentMonth);
}

// ==================== 导出功能 ====================

// 1. 导出为CSV
function exportToCSV() {
    try {
        const exportCurrentMonth = document.getElementById('export-current-month').checked;
        let dataToExport = allTransactions;
        
        if (exportCurrentMonth) {
            const currentMonth = new Date().toISOString().slice(0, 7);
            dataToExport = allTransactions.filter(record => 
                record.date.slice(0, 7) === currentMonth
            );
        }
        
        if (dataToExport.length === 0) {
            showMessage('没有可导出的数据', 'error');
            return;
        }
        
        // CSV标题行
        const headers = ['日期', '类型', '分类', '金额', '描述', '创建时间'];
        
        // 转换数据
        const csvData = dataToExport.map(record => [
            record.date,
            record.type === 'income' ? '收入' : '支出',
            getCategoryName(record.category),
            record.amount,
            record.description || '',
            new Date(record.created_at).toLocaleString('zh-CN')
        ]);
        
        // 创建CSV内容
        const csvContent = [
            headers.join(','),
            ...csvData.map(row => row.map(cell => {
                // 处理包含逗号、引号或换行符的单元格
                if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(','))
        ].join('\n');
        
        // 创建Blob并下载
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        const dateStr = new Date().toISOString().slice(0, 10);
        const monthStr = exportCurrentMonth ? `_${new Date().toISOString().slice(0, 7)}` : '';
        link.setAttribute('href', url);
        link.setAttribute('download', `财务记录_${dateStr}${monthStr}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage('CSV导出成功！', 'success');
        console.log(`📊 导出 ${dataToExport.length} 条记录到CSV`);
        
    } catch (error) {
        console.error('❌ CSV导出失败:', error);
        showMessage(`导出失败: ${error.message}`, 'error');
    }
}

// 2. 导出为PDF（简化版 - 使用打印功能）
function exportToPDF() {
    showMessage('PDF导出功能需要额外库支持，这里使用打印功能替代', 'info');
    printReport();
}

// 3. 打印报表
function printReport() {
    const printWindow = window.open('', '_blank');
    const exportCurrentMonth = document.getElementById('export-current-month').checked;
    
    let dataToExport = allTransactions;
    if (exportCurrentMonth) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        dataToExport = allTransactions.filter(record => 
            record.date.slice(0, 7) === currentMonth
        );
    }
    
    // 计算统计数据
    let totalIncome = 0;
    let totalExpense = 0;
    const categorySummary = {};
    
    dataToExport.forEach(record => {
        if (record.type === 'income') {
            totalIncome += parseFloat(record.amount);
        } else {
            totalExpense += parseFloat(record.amount);
            const categoryName = getCategoryName(record.category);
            categorySummary[categoryName] = (categorySummary[categoryName] || 0) + parseFloat(record.amount);
        }
    });
    
    const balance = totalIncome - totalExpense;
    const currentDate = new Date().toLocaleDateString('zh-CN');
    
    // 构建打印内容
    const printContent = `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <title>财务报告 - ${currentDate}</title>
            <style>
                body { font-family: 'SimSun', serif; margin: 20px; }
                .print-header { text-align: center; margin-bottom: 30px; }
                .print-header h1 { color: #333; margin-bottom: 10px; }
                .print-header .subtitle { color: #666; font-size: 16px; }
                .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
                .stat-card { border: 1px solid #ddd; padding: 20px; text-align: center; border-radius: 8px; }
                .stat-card.income { border-top: 4px solid #2ecc71; }
                .stat-card.expense { border-top: 4px solid #e74c3c; }
                .stat-card.balance { border-top: 4px solid #3498db; }
                .stat-value { font-size: 24px; font-weight: bold; margin: 10px 0; }
                .stat-label { color: #666; }
                table { width: 100%; border-collapse: collapse; margin: 30px 0; }
                th { background-color: #f5f5f5; padding: 12px; text-align: left; border-bottom: 2px solid #ddd; }
                td { padding: 10px 12px; border-bottom: 1px solid #eee; }
                tr:hover { background-color: #f9f9f9; }
                .income-row { color: #2ecc71; }
                .expense-row { color: #e74c3c; }
                .category-summary { margin: 30px 0; }
                .category-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                .print-footer { margin-top: 50px; text-align: center; color: #999; font-size: 14px; }
                @media print {
                    .no-print { display: none; }
                    .stat-card { break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h1>个人财务报告</h1>
                <div class="subtitle">生成时间: ${currentDate} | 记录数量: ${dataToExport.length} 条</div>
                <div class="subtitle">${exportCurrentMonth ? '本月数据' : '全部数据'}</div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card income">
                    <div class="stat-label">总收入</div>
                    <div class="stat-value">¥${totalIncome.toFixed(2)}</div>
                </div>
                <div class="stat-card expense">
                    <div class="stat-label">总支出</div>
                    <div class="stat-value">¥${totalExpense.toFixed(2)}</div>
                </div>
                <div class="stat-card balance">
                    <div class="stat-label">结余</div>
                    <div class="stat-value">¥${balance.toFixed(2)}</div>
                </div>
            </div>
            
            <h3>交易记录明细</h3>
            <table>
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>类型</th>
                        <th>分类</th>
                        <th>金额</th>
                        <th>描述</th>
                    </tr>
                </thead>
                <tbody>
                    ${dataToExport.map(record => `
                        <tr class="${record.type}-row">
                            <td>${formatDate(record.date)}</td>
                            <td>${record.type === 'income' ? '收入' : '支出'}</td>
                            <td>${getCategoryName(record.category)}</td>
                            <td>¥${parseFloat(record.amount).toFixed(2)}</td>
                            <td>${record.description || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            ${Object.keys(categorySummary).length > 0 ? `
            <div class="category-summary">
                <h3>支出分类统计</h3>
                ${Object.entries(categorySummary)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, amount]) => `
                    <div class="category-item">
                        <span>${category}</span>
                        <span>¥${amount.toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            <div class="print-footer">
                <p>--- 报告结束 ---</p>
                <p>本报告由个人财务管理工具生成</p>
                <p>© ${new Date().getFullYear()} - 仅供个人使用</p>
            </div>
            
            <div class="no-print" style="margin-top: 30px; text-align: center;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    打印报告
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; margin-left: 10px; background: #95a5a6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    关闭窗口
                </button>
            </div>
        </body>
        </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // 延迟自动打印
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

// 4. 添加事件监听器
// 在DOMContentLoaded事件监听器中添加：
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM加载完成');
    
    // 初始化应用
    initializeApp();
    
    // 绑定事件
    addRecordForm.addEventListener('submit', handleFormSubmit);
    typeSelect.addEventListener('change', updateCategoryOptions);
    filterTypeSelect.addEventListener('change', handleFilterChange);
    filterMonthInput.addEventListener('change', handleFilterChange);
    
    // 图表筛选事件
    document.getElementById('chart-type-select')?.addEventListener('change', function() {
        if (this.value === 'year') {
            showMessage('年度统计功能将在下一步实现', 'info');
            this.value = 'month'; // 重置为月份
        }
    });
    
    // 显示测试消息
    setTimeout(() => {
        showMessage('个人财务管理工具已就绪！', 'success');
    }, 1000);
});
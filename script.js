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
        
        // 重新加载预算数据（因为支出可能变化）
        await loadBudgetData();

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

/**更新分类下拉选项 */
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
/**表单提交处理 */
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

        // 重新加载预算数据（因为支出可能变化）
        await loadBudgetData();

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

/**筛选处理 */
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
        // 加载分类数据
        console.log('📂 正在加载分类数据...');
        categories = await fetchCategories();
        updateCategoryOptions();
        
        // 加载交易记录
        console.log('📂 正在加载交易记录...');
        allTransactions = await fetchTransactions();
        
        // 初始化预算功能
        console.log('📂 正在初始化预算功能...');
        initBudgetCategoryOptions();
        initBudgetForm();
        initMonthNavigation();
        
        // 加载预算数据
        await loadBudgetData();

        // 更新UI
        updateUI();
        
        // 显示成功消息
        showMessage('数据加载完成！', 'success');
        
        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        showMessage('初始化失败，请刷新页面重试', 'error');
    }
}

// ==================== 事件监听器 ====================
/**添加事件监听器 */
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

// ==================== 预算管理功能 ====================

let budgets = [];
let currentBudgetMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
let budgetSummary = [];

// 1. 获取预算列表
async function fetchBudgets(month = currentBudgetMonth) {
    try {
        console.log(`📡 正在获取 ${month} 的预算数据...`);
        const response = await fetch(`${API_BASE_URL}/budgets?month=${month}`);
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }
        const data = await response.json();
        console.log(`✅ 获取到 ${data.length} 条预算记录`);
        return data;
    } catch (error) {
        console.error('❌ 获取预算列表失败:', error);
        showMessage('获取预算数据失败', 'error');
        return [];
    }
}

// 2. 获取预算统计
async function fetchBudgetSummary(month = currentBudgetMonth) {
    try {
        console.log(`📊 正在获取 ${month} 的预算统计...`);
        const response = await fetch(`${API_BASE_URL}/budgets/summary/${month}`);
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }
        const data = await response.json();
        console.log(`✅ 获取到 ${data.length} 条预算统计`);
        return data;
    } catch (error) {
        console.error('❌ 获取预算统计失败:', error);
        return [];
    }
}

// 3. 添加或更新预算
async function saveBudget(budgetData) {
    try {
        const response = await fetch(`${API_BASE_URL}/budgets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(budgetData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || `HTTP错误: ${response.status}`);
        }
        
        const newBudget = await response.json();
        console.log('✅ 预算保存成功:', newBudget);
        return newBudget;
    } catch (error) {
        console.error('❌ 保存预算失败:', error);
        throw error;
    }
}

/**更新预算汇总卡片 */
function updateBudgetSummaryCards() {
    let totalBudget = 0;
    let totalUsed = 0;
    
    budgetSummary.forEach(item => {
        totalBudget += parseFloat(item.budget_amount);
        totalUsed += parseFloat(item.actual_amount);
    });
    
    const totalUsage = totalBudget > 0 ? Math.round((totalUsed / totalBudget) * 100) : 0;
    
    // 更新DOM
    document.getElementById('total-budget').textContent = formatAmount(totalBudget);
    document.getElementById('total-used').textContent = formatAmount(totalUsed);
    document.getElementById('total-usage').textContent = `${totalUsage}%`;
    
    // 根据使用率添加颜色
    const usageElement = document.getElementById('total-usage');
    usageElement.className = 'summary-value';
    
    if (totalUsage <= 70) {
        usageElement.style.color = '#2ecc71';
    } else if (totalUsage <= 90) {
        usageElement.style.color = '#f39c12';
    } else {
        usageElement.style.color = '#e74c3c';
    }
}

/**渲染预算列表 */
function renderBudgets() {
    const budgetsBody = document.getElementById('budgets-body');
    const loadingRow = document.getElementById('budget-loading');
    const noBudgetsElement = document.getElementById('no-budgets');
    
    // 隐藏加载状态
    if (loadingRow) loadingRow.style.display = 'none';
    
    // 清空表格
    budgetsBody.innerHTML = '';
    
    // 检查是否有数据
    if (budgetSummary.length === 0) {
        noBudgetsElement.style.display = 'block';
        return;
    }
    
    // 显示表格
    noBudgetsElement.style.display = 'none';
    
    // 添加数据行
    budgetSummary.forEach(item => {
        const row = document.createElement('tr');
        const budgetAmount = parseFloat(item.budget_amount);
        const actualAmount = parseFloat(item.actual_amount);
        const usagePercentage = budgetAmount > 0 ? Math.round((actualAmount / budgetAmount) * 100) : 0;
        
        // 关键修复：找到对应的预算记录来获取ID
        const budgetRecord = budgets.find(b => 
            b.category_id === item.category_id && 
            b.month === currentBudgetMonth
        );
        
        const budgetId = budgetRecord ? budgetRecord.id : null;
        
        console.log(`预算项匹配:`, {
            category_id: item.category_id,
            budget_record_found: !!budgetRecord,
            budget_id: budgetId,
            budget_amount: budgetAmount
        });

        // 确定状态
        let statusClass = 'status-within';
        let statusText = '正常';
        let barClass = 'usage-bar safe';
        
        if (usagePercentage > 90) {
            statusClass = 'status-over';
            statusText = '超支';
            barClass = 'usage-bar danger';
        } else if (usagePercentage > 70) {
            statusClass = 'status-warning';
            statusText = '预警';
            barClass = 'usage-bar warning';
        }
        
        // 确定是否显示操作按钮（有预算的设置才显示）
        const hasBudget = budgetAmount > 0;
        const categoryId = item.category_id;
        
        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="category-icon">${item.category_icon || '📦'}</span>
                    ${item.category_name || '未分类'}
                </div>
            </td>
            <td class="amount-cell">${budgetAmount > 0 ? formatAmount(budgetAmount) : '未设置'}</td>
            <td class="amount-cell">${formatAmount(actualAmount)}</td>
            <td>
                ${hasBudget ? `
                    <div style="margin-bottom: 5px;">
                        <strong>${usagePercentage}%</strong>
                    </div>
                    <div class="usage-bar-container">
                        <div class="${barClass}" style="width: ${Math.min(usagePercentage, 100)}%"></div>
                    </div>
                ` : '--'}
            </td>
            <td>
                ${hasBudget ? `<span class="budget-status ${statusClass}">${statusText}</span>` : '--'}
            </td>
            <td>
                ${hasBudget ? `
                    <div class="budget-actions">
                        <button class="btn-budget-edit" onclick="editBudget(${categoryId}, ${budgetAmount})">
                            <i class="fas fa-edit"></i> 编辑
                        </button>
                        <button class="btn-budget-delete" onclick="deleteBudgetRecord(${item.id})">
                            <i class="fas fa-trash"></i> 删除
                        </button>
                    </div>
                ` : `
                    <button class="btn-budget-edit" onclick="setBudgetForCategory(${categoryId})">
                        <i class="fas fa-plus"></i> 设置
                    </button>
                `}
            </td>
        `;
        
        budgetsBody.appendChild(row);
    });
    
    console.log(`📋 渲染了 ${budgetSummary.length} 条预算记录`);
}

// 7. 初始化预算分类下拉菜单
function initBudgetCategoryOptions() {
    const budgetCategorySelect = document.getElementById('budget-category');
    
    // 清空现有选项
    budgetCategorySelect.innerHTML = '<option value="">选择支出分类</option>';
    
    // 只显示支出分类
    const expenseCategories = categories.filter(c => c.type === 'expense');
    
    expenseCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = `${category.icon || '📦'} ${category.name}`;
        budgetCategorySelect.appendChild(option);
    });
}

// 8. 设置预算表单提交处理
function initBudgetForm() {
    const budgetForm = document.getElementById('set-budget-form');
    
    budgetForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const categorySelect = document.getElementById('budget-category');
        const amountInput = document.getElementById('budget-amount');
        const submitButton = budgetForm.querySelector('button[type="submit"]');
        
        const originalText = submitButton.innerHTML;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
        submitButton.disabled = true;
        
        try {
            const budgetData = {
                category_id: parseInt(categorySelect.value),
                month: currentBudgetMonth,
                amount: parseFloat(amountInput.value)
            };
            
            console.log('📝 提交预算数据:', budgetData);
            
            if (!budgetData.category_id || !budgetData.amount || budgetData.amount <= 0) {
                throw new Error('请填写所有字段，且金额必须大于0');
            }
            
            // 保存预算
            await saveBudget(budgetData);
            
            // 重新加载预算数据
            await loadBudgetData();
            
            // 重置表单
            budgetForm.reset();
            
            showMessage('预算设置成功！', 'success');
            
        } catch (error) {
            console.error('❌ 预算设置失败:', error);
            showMessage(`设置失败: ${error.message}`, 'error');
        } finally {
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        }
    });
}

// 9. 月份导航功能
function initMonthNavigation() {
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const currentMonthDisplay = document.getElementById('current-month-display');
    
    // 更新月份显示
    function updateMonthDisplay() {
        currentMonthDisplay.textContent = currentBudgetMonth;
        
        // 禁用未来的月份按钮
        const currentDate = new Date();
        const currentYearMonth = currentDate.toISOString().slice(0, 7);
        nextMonthBtn.disabled = currentBudgetMonth >= currentYearMonth;
    }
    
    // 切换月份
    async function changeMonth(direction) {
        const [year, month] = currentBudgetMonth.split('-').map(Number);
        
        let newYear = year;
        let newMonth = month + direction;
        
        if (newMonth < 1) {
            newMonth = 12;
            newYear--;
        } else if (newMonth > 12) {
            newMonth = 1;
            newYear++;
        }
        
        currentBudgetMonth = `${newYear}-${String(newMonth).padStart(2, '0')}`;
        updateMonthDisplay();
        
        // 加载新月份的数据
        await loadBudgetData();
    }
    
    // 绑定事件
    prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    nextMonthBtn.addEventListener('click', () => changeMonth(1));
    
    // 初始化显示
    updateMonthDisplay();
}

/**加载预算数据 */
async function loadBudgetData() {
    try {
        console.log(`📂 正在加载 ${currentBudgetMonth} 的预算数据...`);
        
        // 并行加载预算列表和统计
        const [budgetsData, summaryData] = await Promise.all([
            fetchBudgets(currentBudgetMonth),
            fetchBudgetSummary(currentBudgetMonth)
        ]);
        
        budgets = budgetsData;
        budgetSummary = summaryData;
        
        // 验证数据：确保每个预算统计项都能找到对应的预算记录
        budgetSummary.forEach(item => {
            const matchingBudget = budgets.find(b => 
                b.category_id === item.category_id && 
                b.month === currentBudgetMonth
            );
            
            if (matchingBudget) {
                console.log(`✅ 匹配成功: 分类 ${item.category_name} -> 预算ID ${matchingBudget.id}`);
                item.id = matchingBudget.id; // 确保统计项也有ID
            } else {
                console.log(`⚠️ 未匹配: 分类 ${item.category_name} 没有对应的预算记录`);
                item.id = null;
            }
        });

        // 更新UI
        updateBudgetSummaryCards();
        renderBudgets();
        
        console.log(`✅ ${currentBudgetMonth} 预算数据加载完成`);
    } catch (error) {
        console.error('❌ 加载预算数据失败:', error);
        showMessage('加载预算数据失败', 'error');
    }
}

/**编辑预算 */
function editBudget(categoryId, currentAmount) {
    const budgetCategorySelect = document.getElementById('budget-category');
    const budgetAmountInput = document.getElementById('budget-amount');
    
    // 设置表单值
    budgetCategorySelect.value = categoryId;
    budgetAmountInput.value = currentAmount;
    
    // 滚动到表单
    document.querySelector('.budget-form').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
    });
    
    // 聚焦到金额输入框
    budgetAmountInput.focus();
    
    showMessage(`正在编辑分类预算，当前金额: ${formatAmount(currentAmount)}`, 'info');
}

// 12. 为特定分类设置预算
function setBudgetForCategory(categoryId) {
    const budgetCategorySelect = document.getElementById('budget-category');
    const budgetAmountInput = document.getElementById('budget-amount');
    
    // 设置分类
    budgetCategorySelect.value = categoryId;
    
    // 聚焦到金额输入框
    budgetAmountInput.focus();
    
    showMessage('请为选中的分类设置预算金额', 'info');
}


/**删除预算记录 */
async function deleteBudgetRecord(id) {
    // 1. 验证ID
    if (!id || isNaN(id) || id <= 0) {
        console.error('❌ 删除失败: 无效的预算ID', id);
        showMessage('删除失败: 无效的预算ID', 'error');
        return;
    }
    
    // 2. 确认对话框
    if (!confirm('确定要删除这个预算设置吗？此操作不可撤销。')) {
        return;
    }
    
    try {
        console.log(`🗑️ 正在删除预算，ID: ${id}`);
        
        // 3. 发送删除请求
        const response = await fetch(`${API_BASE_URL}/budgets/${id}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        // 4. 检查响应
        if (!response.ok) {
            let errorMessage = `HTTP错误: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.details || errorMessage;
            } catch (e) {
                // 如果响应不是JSON，使用状态文本
                errorMessage = `${response.status} ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }
        
        // 5. 处理成功响应
        const result = await response.json();
        console.log('✅ 预算删除成功:', result);
        
        // 6. 从本地数据中移除
        budgets = budgets.filter(b => b.id !== id);
        budgetSummary = budgetSummary.filter(item => item.id !== id);
        
        // 7. 重新渲染UI
        updateBudgetSummaryCards();
        renderBudgets();
        
        showMessage('预算删除成功！', 'success');
        
    } catch (error) {
        console.error('❌ 删除预算失败:', error);
        showMessage(`删除失败: ${error.message}`, 'error');
    }
}

// 用户登录
async function loginUser(username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `登录失败: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ 登录失败:', error);
        throw error;
    }
}

// 用户注册
async function registerUser(userData) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `注册失败: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ 注册失败:', error);
        throw error;
    }
}

// ==================== 用户认证管理 ====================
function saveAuthInfo(token, user) {
    authToken = token;
    currentUser = user;
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
}

function clearAuthInfo() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
}

function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
        try {
            authToken = token;
            currentUser = JSON.parse(userStr);
            return true;
        } catch (error) {
            clearAuthInfo();
            return false;
        }
    }
    return false;
}

// ==================== 界面切换 ====================
function showLoginScreen() {
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    
    if (loginContainer) loginContainer.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
}

function showAppScreen() {
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const currentUserElement = document.getElementById('current-user');
    const usernameDisplay = document.getElementById('username-display');
    const footerUsername = document.getElementById('footer-username');
    
    if (loginContainer) loginContainer.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    
    // 更新用户信息显示
    if (currentUserElement) {
        currentUserElement.textContent = currentUser?.username || '用户';
    }
    if (usernameDisplay) {
        usernameDisplay.textContent = currentUser?.username || '未登录';
    }
    if (footerUsername) {
        footerUsername.textContent = currentUser?.username || '未登录';
    }
}

// ==================== 登录/注册表单处理 ====================
function initLoginForm() {
    const loginForm = document.getElementById('login-form');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const toggleLoginPassword = document.getElementById('toggle-login-password');
    
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';
        submitBtn.disabled = true;
        
        try {
            const username = loginUsernameInput.value.trim();
            const password = loginPasswordInput.value;
            
            if (!username || !password) {
                throw new Error('请输入用户名和密码');
            }
            
            const result = await loginUser(username, password);
            
            if (result.success) {
                saveAuthInfo(result.token, result.user);
                showAppScreen();
                showMessage('登录成功！', 'success');
                
                // 初始化应用数据
                await initializeAppData();
            } else {
                throw new Error(result.message || '登录失败');
            }
        } catch (error) {
            console.error('❌ 登录失败:', error);
            showMessage(`登录失败: ${error.message}`, 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
    
    // 密码显示/隐藏切换
    if (toggleLoginPassword && loginPasswordInput) {
        toggleLoginPassword.addEventListener('click', function() {
            const type = loginPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            loginPasswordInput.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
}

function initRegisterForm() {
    const registerForm = document.getElementById('register-form');
    const registerUsernameInput = document.getElementById('register-username');
    const registerEmailInput = document.getElementById('register-email');
    const registerPasswordInput = document.getElementById('register-password');
    const registerConfirmPasswordInput = document.getElementById('register-confirm-password');
    const toggleRegisterPassword = document.getElementById('toggle-register-password');
    const toggleRegisterConfirmPassword = document.getElementById('toggle-register-confirm-password');
    
    if (!registerForm) return;
    
    registerForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 注册中...';
        submitBtn.disabled = true;
        
        try {
            const username = registerUsernameInput.value.trim();
            const email = registerEmailInput.value.trim();
            const password = registerPasswordInput.value;
            const confirmPassword = registerConfirmPasswordInput.value;
            
            if (!username || !email || !password || !confirmPassword) {
                throw new Error('请填写所有字段');
            }
            
            if (password.length < 6) {
                throw new Error('密码长度至少6位');
            }
            
            if (password !== confirmPassword) {
                throw new Error('两次输入的密码不一致');
            }
            
            const result = await registerUser({ username, email, password });
            
            if (result.success) {
                saveAuthInfo(result.token, result.user);
                showAppScreen();
                showMessage('注册成功！已自动登录', 'success');
                
                // 切换到登录标签
                const loginTab = document.querySelector('[data-tab="login"]');
                const registerTab = document.querySelector('[data-tab="register"]');
                if (loginTab && registerTab) {
                    loginTab.classList.add('active');
                    registerTab.classList.remove('active');
                    document.getElementById('login-form').classList.add('active');
                    document.getElementById('register-form').classList.remove('active');
                }
                
                // 初始化应用数据
                await initializeAppData();
            } else {
                throw new Error(result.message || '注册失败');
            }
        } catch (error) {
            console.error('❌ 注册失败:', error);
            showMessage(`注册失败: ${error.message}`, 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
    
    // 密码显示/隐藏切换
    if (toggleRegisterPassword && registerPasswordInput) {
        toggleRegisterPassword.addEventListener('click', function() {
            const type = registerPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            registerPasswordInput.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
    
    if (toggleRegisterConfirmPassword && registerConfirmPasswordInput) {
        toggleRegisterConfirmPassword.addEventListener('click', function() {
            const type = registerConfirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            registerConfirmPasswordInput.setAttribute('type', type);
            this.classList.toggle('fa-eye');
            this.classList.toggle('fa-eye-slash');
        });
    }
}

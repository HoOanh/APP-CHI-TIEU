'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, getCurrentMonth, formatShortDate, cn } from '@/lib/utils'
import { MonthPicker } from '@/components/MonthPicker'
import { Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

interface Category {
  id: string
  name: string
  emoji: string
  color: string
}

interface Expense {
  id: string
  amount: number
  description: string
  note: string | null
  date: string
  category_id: string
  category: Category
  type: 'income' | 'expense'
}

export default function ExpensesPage() {
  const [month, setMonth] = useState(getCurrentMonth())
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalIncome, setTotalIncome] = useState(0)
  const [totalExpense, setTotalExpense] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const { showToast } = useToast()

  // Form state
  const [expenseType, setExpenseType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories')
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
      }
    } catch (error) {
      console.error('Failed to fetch categories', error)
    }
  }, [])

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true)
    try {
      let url = `/api/expenses?month=${month}`
      if (activeCategoryId !== 'all') {
        url += `&category_id=${activeCategoryId}`
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const items: Expense[] = (data.items || []).map((item: Record<string, unknown>) => ({
          id: String(item.id),
          amount: Number(item.amount || 0),
          description: String(item.description || ''),
          note: item.note ? String(item.note) : null,
          date: String(item.expense_date || item.date || ''),
          category_id: String(item.category_id || ''),
          type: item.type === 'income' ? 'income' : 'expense',
          category: {
            id: String(item.category_id || ''),
            name: String(item.category_name || (item.category as Category)?.name || 'Khác'),
            emoji: String(item.category_icon || (item.category as Category)?.emoji || '📦'),
            color: String(item.category_color || (item.category as Category)?.color || '#64748b')
          }
        }))
        setExpenses(items)
        setTotalAmount(data.total ?? items.reduce((sum, i) => sum + (i.type === 'income' ? i.amount : -i.amount), 0))
        setTotalIncome(data.totalIncome ?? items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0))
        setTotalExpense(data.totalExpense ?? items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0))
      }
    } catch (error) {
      console.error('Failed to fetch expenses', error)
      showToast('Lỗi khi tải dữ liệu chi tiêu', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [month, activeCategoryId, showToast])

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    // Refetch when the selected month or filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchExpenses()
  }, [fetchExpenses])

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !description || !selectedCategory || !date) {
      showToast('Vui lòng điền đầy đủ thông tin bắt buộc', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount.replace(/[^0-9]/g, '')),
          description,
          note,
          category_id: selectedCategory,
          expense_date: date,
          type: expenseType
        })
      })

      if (res.ok) {
        showToast(`Thêm ${expenseType === 'income' ? 'thu nhập' : 'chi tiêu'} thành công`, 'success')
        setIsAddDialogOpen(false)
        resetForm()
        fetchExpenses()
      } else {
        showToast('Lỗi khi thêm mới', 'error')
      }
    } catch (error) {
      console.error('Error adding expense:', error)
      showToast('Đã có lỗi xảy ra', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa mục này?')) return

    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        showToast('Đã xóa', 'success')
        fetchExpenses()
      } else {
        showToast('Lỗi khi xóa', 'error')
      }
    } catch (error) {
      console.error('Error deleting expense:', error)
      showToast('Đã có lỗi xảy ra', 'error')
    }
  }

  const resetForm = () => {
    setExpenseType('expense')
    setAmount('')
    setDescription('')
    setNote('')
    setSelectedCategory('')
    setDate(new Date().toISOString().split('T')[0])
  }

  // Format amount input with dots
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '')
    if (rawValue) {
      setAmount(Number(rawValue).toLocaleString('vi-VN'))
    } else {
      setAmount('')
    }
  }

  // Group expenses by date
  const groupedExpenses = expenses.reduce((acc, expense) => {
    const expenseDate = expense.date.split('T')[0] || expense.date
    if (!acc[expenseDate]) {
      acc[expenseDate] = { net: 0, items: [] }
    }
    acc[expenseDate].items.push(expense)
    if (expense.type === 'income') {
      acc[expenseDate].net += expense.amount
    } else {
      acc[expenseDate].net -= expense.amount
    }
    return acc
  }, {} as Record<string, { net: number; items: Expense[] }>)

  const sortedDates = Object.keys(groupedExpenses).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  )

  return (
    <div className="pb-nav max-w-lg mx-auto min-h-screen bg-background">
      {/* Header Section */}
      <div className="px-4 pt-8 pb-6 bg-white border-b border-border sticky top-0 z-10">
        <h1 className="text-xl font-medium text-center mb-4">Chi tiêu & Thu nhập</h1>
        
        <div className="flex flex-col items-center mb-4">
          <span className="text-sm text-muted-foreground mb-1">Số dư ròng tháng này</span>
          <span className={cn(
            "text-4xl font-bold tabular-nums tracking-tight",
            totalAmount >= 0 ? "text-[#00BC7C]" : "text-[#FE5A61]"
          )}>
            {totalAmount >= 0 ? `+${formatCurrency(totalAmount)}` : `-${formatCurrency(Math.abs(totalAmount))}`}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-[#00BC7C]/10 border border-[#00BC7C]/20 rounded-2xl p-3 flex flex-col items-center">
            <span className="text-xs text-muted-foreground mb-0.5">Thu nhập</span>
            <span className="text-base font-semibold text-[#00BC7C] tabular-nums">
              +{formatCurrency(totalIncome)}
            </span>
          </div>
          <div className="bg-[#FE5A61]/10 border border-[#FE5A61]/20 rounded-2xl p-3 flex flex-col items-center">
            <span className="text-xs text-muted-foreground mb-0.5">Chi tiêu</span>
            <span className="text-base font-semibold text-[#FE5A61] tabular-nums">
              -{formatCurrency(totalExpense)}
            </span>
          </div>
        </div>

        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {/* Category Filter */}
      <div className="py-4 bg-white sticky top-[200px] z-10 border-b border-border shadow-sm">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex w-max space-x-2 px-4">
            <Badge
              variant={activeCategoryId === 'all' ? 'default' : 'outline'}
              className="px-4 py-2 text-sm cursor-pointer rounded-full transition-all"
              onClick={() => setActiveCategoryId('all')}
            >
              Tất cả
            </Badge>
            {categories.map((cat) => (
              <Badge
                key={cat.id}
                variant={activeCategoryId === cat.id ? 'default' : 'outline'}
                className="px-4 py-2 text-sm cursor-pointer rounded-full transition-all flex items-center gap-1.5"
                onClick={() => setActiveCategoryId(cat.id)}
              >
                <span>{cat.emoji}</span>
                <span>{cat.name}</span>
              </Badge>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>

      {/* Expenses List */}
      <div className="p-4 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-70">
            <div className="text-6xl mb-4">💸</div>
            <h3 className="text-lg font-medium mb-1">Chưa có chi tiêu nào</h3>
            <p className="text-sm text-muted-foreground">Bạn chưa ghi nhận chi tiêu nào trong tháng này.</p>
          </div>
        ) : (
          sortedDates.map((dateStr) => {
            const group = groupedExpenses[dateStr]
            return (
              <div key={dateStr} className="space-y-3">
                {/* Date Header */}
                <div className="flex justify-between items-center text-sm font-medium text-muted-foreground px-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-muted px-2 py-1 rounded-md text-foreground">
                      {formatShortDate(dateStr)}
                    </span>
                  </div>
                  <span className={cn(
                    "font-semibold tabular-nums",
                    group.net >= 0 ? "text-[#00BC7C]" : "text-[#FE5A61]"
                  )}>
                    {group.net >= 0 ? `+${formatCurrency(group.net)}` : `-${formatCurrency(Math.abs(group.net))}`}
                  </span>
                </div>

                {/* Expenses in Date */}
                <Card className="rounded-2xl overflow-hidden bg-card/50 shadow-sm border-border">
                  <div className="divide-y divide-border">
                    {group.items.map((expense) => (
                      <div key={expense.id} className="flex items-center p-4 hover:bg-muted/30 transition-colors group">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 mr-3"
                          style={{ backgroundColor: `${expense.category?.color || '#3b82f6'}20` }}
                        >
                          {expense.category?.emoji || '💰'}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{expense.description}</p>
                          {expense.note && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{expense.note}</p>
                          )}
                        </div>
                        
                        <div className="flex flex-col items-end shrink-0 ml-3">
                          <span className={cn(
                            "font-semibold tabular-nums",
                            expense.type === 'income' ? "text-[#00BC7C]" : "text-[#FE5A61]"
                          )}>
                            {expense.type === 'income' ? `+${formatCurrency(expense.amount)}` : `-${formatCurrency(expense.amount)}`}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 ml-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDelete(expense.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )
          })
        )}
      </div>

      {/* Floating Action Button */}
      <Button
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg shadow-primary/30 z-20"
        size="icon"
        onClick={() => setIsAddDialogOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Add Expense Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl w-[95%] p-0 overflow-hidden bg-card border-border">
          <DialogHeader className="p-6 pb-2 border-b border-border bg-muted/20">
            <DialogTitle className="text-xl">Thêm mới giao dịch</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleAddExpense} className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-2 bg-muted/40 p-1 rounded-xl">
              <Button
                type="button"
                variant={expenseType === 'expense' ? 'default' : 'ghost'}
                className={cn(
                  "rounded-lg text-sm font-medium h-9",
                  expenseType === 'expense' && "bg-[#FE5A61] hover:bg-[#FE5A61]/90 text-white"
                )}
                onClick={() => setExpenseType('expense')}
              >
                Chi tiêu
              </Button>
              <Button
                type="button"
                variant={expenseType === 'income' ? 'default' : 'ghost'}
                className={cn(
                  "rounded-lg text-sm font-medium h-9",
                  expenseType === 'income' && "bg-[#00BC7C] hover:bg-[#00BC7C]/90 text-white"
                )}
                onClick={() => setExpenseType('income')}
              >
                Thu nhập
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Số tiền (VNĐ)</Label>
              <div className="relative">
                <Input
                  id="amount"
                  placeholder="0"
                  value={amount}
                  onChange={handleAmountChange}
                  className={cn(
                    "pl-8 text-lg font-medium",
                    expenseType === 'income' ? "text-[#00BC7C]" : "text-[#FE5A61]"
                  )}
                  inputMode="numeric"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  ₫
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Mô tả</Label>
              <Input
                id="description"
                placeholder="VD: Ăn trưa, Cà phê..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Danh mục</Label>
              <Select value={selectedCategory} onValueChange={(val) => setSelectedCategory(val ?? '')}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Chọn danh mục" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <span>{cat.emoji}</span>
                        <span>{cat.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Ngày</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Ghi chú (Tùy chọn)</Label>
              <Textarea
                id="note"
                placeholder="Thêm chi tiết về khoản chi này..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="resize-none"
                rows={2}
              />
            </div>

            <Button type="submit" className="w-full mt-4" disabled={isSubmitting}>
              {isSubmitting ? 'Đang thêm...' : 'Thêm chi tiêu'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'
import { useRef } from 'react'
import {
  DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor,
  KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Flame, BookOpen, Users, Zap, FileText, GripVertical, Trash2, Plus } from 'lucide-react'
import type { WorkbookBlock, WorkbookProblemKind, WorkbookBlockDifficulty } from '@/lib/types'

interface KindMeta { kind: WorkbookProblemKind; label: string; hint: string; icon: typeof Flame }

const KIND_META: KindMeta[] = [
  { kind: 'hook',     label: 'Warm-Up',       hint: 'fun hook from their world', icon: Flame },
  { kind: 'story',    label: 'Story Problem', hint: 'word problem, local life',  icon: BookOpen },
  { kind: 'peer',     label: 'Partner Check', hint: 'solve & compare in pairs',  icon: Users },
  { kind: 'hidden',   label: 'Stretch',       hint: 'sneaky harder mix-in',      icon: Zap },
  { kind: 'textbook', label: 'Textbook Style',hint: 'exam-format question',      icon: FileText },
]
const META: Record<string, KindMeta> = Object.fromEntries(KIND_META.map(m => [m.kind, m]))
const DIFFS: WorkbookBlockDifficulty[] = ['mixed', 'easy', 'medium', 'hard']

function PaletteItem({ meta, onAdd }: { meta: KindMeta; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${meta.kind}`, data: { kind: 'palette', type: meta.kind } })
  const Icon = meta.icon
  return (
    <button ref={setNodeRef} {...listeners} {...attributes} onClick={onAdd} type="button"
      className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 bg-white text-left active:scale-[0.98] touch-none"
      style={{ borderColor: 'var(--card-border)', opacity: isDragging ? 0.4 : 1, cursor: 'grab' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(58,44,30,0.06)' }}>
        <Icon className="w-3.5 h-3.5 text-ink-soft" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-ink leading-tight">{meta.label}</p>
        <p className="text-[10px] text-ink-faint truncate">{meta.hint}</p>
      </div>
    </button>
  )
}

function SortableBlock({ block, index, onChange, onRemove }: {
  block: WorkbookBlock; index: number; onChange: (patch: Partial<WorkbookBlock>) => void; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const meta = META[block.kind]
  const Icon = meta?.icon ?? FileText
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, borderColor: 'var(--card-border)' }
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-2 rounded-xl border-2 bg-white px-2.5 py-2">
      <button {...attributes} {...listeners} type="button" title="Drag to reorder" className="touch-none cursor-grab shrink-0 text-ink-faint">
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(58,44,30,0.06)' }}>
        <Icon className="w-3.5 h-3.5 text-ink-soft" />
      </span>
      <span className="text-xs font-bold text-ink shrink-0" style={{ minWidth: 78 }}>{meta?.label ?? block.kind}</span>

      <label className="flex items-center gap-1 text-[11px] text-ink-soft ml-auto shrink-0">
        <span className="font-semibold">×</span>
        <input type="number" min={1} max={20} value={block.count}
          onChange={e => onChange({ count: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
          className="w-12 px-1.5 py-1 rounded-lg border-2 text-sm text-center bg-white" style={{ borderColor: 'var(--card-border)' }} />
      </label>
      <select value={block.difficulty} onChange={e => onChange({ difficulty: e.target.value as WorkbookBlockDifficulty })}
        className="px-2 py-1 rounded-lg border-2 text-xs bg-white capitalize shrink-0" style={{ borderColor: 'var(--card-border)' }}>
        {DIFFS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <button type="button" onClick={onRemove} title="Remove" className="shrink-0 text-ink-faint hover:text-red-500">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

function Canvas({ blocks, children }: { blocks: WorkbookBlock[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'wb-canvas' })
  const total = blocks.reduce((s, b) => s + b.count, 0)
  return (
    <div ref={setNodeRef}
      className="rounded-2xl border-2 p-2.5"
      style={{ borderStyle: 'dashed', borderColor: isOver ? 'var(--ink)' : 'var(--card-border)', background: isOver ? 'rgba(58,44,30,0.04)' : 'transparent', minHeight: 96 }}>
      {blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
          <Plus className="w-5 h-5 text-ink-faint" />
          <p className="text-xs font-bold text-ink-soft">Drag question types here</p>
          <p className="text-[11px] text-ink-faint">…or tap one above to add it</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">{children}</div>
          <p className="text-[11px] text-ink-faint mt-2 text-right">{total} problem{total !== 1 ? 's' : ''} per chapter</p>
        </>
      )}
    </div>
  )
}

export default function WorkbookComposer({ value, onChange }: { value: WorkbookBlock[]; onChange: (b: WorkbookBlock[]) => void }) {
  const nextId = useRef(1)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function addBlock(kind: WorkbookProblemKind) {
    const id = `wb-${nextId.current++}-${kind}`
    onChange([...value, { id, kind, count: 2, difficulty: 'mixed' }])
  }
  function patchBlock(id: string, patch: Partial<WorkbookBlock>) {
    onChange(value.map(b => (b.id === id ? { ...b, ...patch } : b)))
  }
  function removeBlock(id: string) {
    onChange(value.filter(b => b.id !== id))
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    if (active.data.current?.kind === 'palette') {
      addBlock(active.data.current.type as WorkbookProblemKind)
      return
    }
    if (active.id !== over.id) {
      const oldIdx = value.findIndex(b => b.id === active.id)
      const newIdx = value.findIndex(b => b.id === over.id)
      if (oldIdx >= 0 && newIdx >= 0) onChange(arrayMove(value, oldIdx, newIdx))
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {KIND_META.map(m => <PaletteItem key={m.kind} meta={m} onAdd={() => addBlock(m.kind)} />)}
      </div>
      <Canvas blocks={value}>
        <SortableContext items={value.map(b => b.id)} strategy={verticalListSortingStrategy}>
          {value.map((b, i) => (
            <SortableBlock key={b.id} block={b} index={i} onChange={patch => patchBlock(b.id, patch)} onRemove={() => removeBlock(b.id)} />
          ))}
        </SortableContext>
      </Canvas>
    </DndContext>
  )
}

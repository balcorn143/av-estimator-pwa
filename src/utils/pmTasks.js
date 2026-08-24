// Helpers for the project-management task system. Tasks live inline on the
// project object (project.tasks) and sync through the same project store as
// every other field — no separate table, no realtime channel.

import { DEFAULT_PM_TASKS, TASK_STATUS_ORDER, TASK_PHASE_BUCKETS } from '../constants';

const PHASE_LIFECYCLE_ORDER = ['pre-construction', 'procurement', 'install', 'commissioning', 'closeout'];

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Instantiate the fixed template for a newly-activated project. Each call
// produces fresh IDs so re-seeding (if it ever happened) wouldn't collide.
export function buildDefaultTasks() {
    const now = new Date().toISOString();
    return DEFAULT_PM_TASKS.map((t, i) => ({
        id: genId(),
        title: t.title,
        phaseBucket: t.phaseBucket,
        status: 'todo',
        assignee: '',
        dueDate: null,
        notes: '',
        order: i,
        createdAt: now,
        completedAt: null,
    }));
}

// Group tasks by status for kanban rendering. Within each column, tasks are
// ordered by the `order` field (set on drag-drop reorder), falling back to
// createdAt for stable ties.
export function groupTasksByStatus(tasks) {
    const groups = {};
    TASK_STATUS_ORDER.forEach(s => { groups[s] = []; });
    (tasks || []).forEach(t => {
        const s = TASK_STATUS_ORDER.includes(t.status) ? t.status : 'todo';
        groups[s].push(t);
    });
    Object.keys(groups).forEach(s => {
        groups[s].sort((a, b) => {
            const ao = a.order ?? 0;
            const bo = b.order ?? 0;
            if (ao !== bo) return ao - bo;
            return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
    });
    return groups;
}

// Summary counts used by the PM dashboard list view. Returns total / done /
// blocked / inProgress so callers can render a progress chip without
// recomputing.
export function summarizeTasks(tasks) {
    const list = tasks || [];
    let done = 0, blocked = 0, inProgress = 0;
    list.forEach(t => {
        if (t.status === 'done') done++;
        else if (t.status === 'blocked') blocked++;
        else if (t.status === 'in_progress') inProgress++;
    });
    return { total: list.length, done, blocked, inProgress };
}

// Derive a project's "current phase" from its tasks — the earliest phase
// bucket in the install lifecycle that still has incomplete work. Drives the
// PM-dashboard pipeline filter. A project with no tasks defaults to
// 'pre-construction'; a project where every task is done returns 'closeout'.
export function getCurrentPhaseBucket(tasks) {
    const list = tasks || [];
    if (list.length === 0) return 'pre-construction';
    for (const phase of PHASE_LIFECYCLE_ORDER) {
        const hasIncomplete = list.some(t => t.phaseBucket === phase && t.status !== 'done');
        if (hasIncomplete) return phase;
    }
    return 'closeout';
}

export { PHASE_LIFECYCLE_ORDER };

// Create a brand-new ad-hoc task (PM clicked "+ Add task" inside a column).
export function makeBlankTask({ status = 'todo', phaseBucket = 'pre-construction', order = 0 } = {}) {
    return {
        id: genId(),
        title: '',
        phaseBucket,
        status,
        assignee: '',
        dueDate: null,
        notes: '',
        order,
        createdAt: new Date().toISOString(),
        completedAt: null,
    };
}

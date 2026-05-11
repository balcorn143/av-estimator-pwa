import React from 'react'
const { useState, useEffect, useCallback, useMemo, useRef } = React
import { CONFIG, supabase, getDataUrl, APP_VERSION } from './config'
import { styles } from './styles'
import { Icons } from './icons'
import { UOM_OPTIONS, SYSTEM_OPTIONS, PHASE_OPTIONS, PROJECT_STATUSES, DEFAULT_COLUMNS, CATALOG_COLUMNS } from './constants'
import { fmtCost, fmtQty, fmtHrs, formatCurrency, formatHours } from './utils/formatters'
import { parseLocationInput, getLocationPath, getAllLocationsFlatted, getLocationsWithItems, getHierarchyLevels, getGroupedByHierarchy, cloneStructure, sortLocationsAlpha, filterLocations } from './utils/locations'
import { generateCatalogId, calculateTotals, itemMatchesSearch, migrateCatalogPhases, migrateProjectPhases, migratePackagePhases } from './utils/catalog'
import { loadCatalog as loadCatalogFromDb, upsertItem as upsertCatalogItemRemote, deleteItem as deleteCatalogItemRemote, bulkUpsert as bulkUpsertCatalogRemote, bulkDelete as bulkDeleteCatalogRemote, rowToItem as catalogRowToItem } from './utils/catalogStore'
import { generatePackageId, resolvePackageInstance, findAllPackageInstances, getFlattenedItems } from './utils/packages'
import { generateEsticomWorkbook, generateProcoreEstimateWorkbook } from './utils/export'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import useFlexibleColumns from './hooks/useFlexibleColumns'
import ColumnLayoutManager from './components/ColumnLayoutManager'
import LocationTree from './components/LocationTree'
import MoveLocationModal from './components/MoveLocationModal'
import LocationView from './components/LocationView'
import AllLocationsView from './components/AllLocationsView'
import ProjectsHome from './components/ProjectsHome'
import SearchModal from './components/SearchModal'
import AddLocationModal from './components/AddLocationModal'
import DuplicateModal from './components/DuplicateModal'
import DeleteConfirmModal from './components/DeleteConfirmModal'
import NewProjectModal from './components/NewProjectModal'
import EditProjectModal from './components/EditProjectModal'
import TeamModal from './components/TeamModal'
import RevisionPromptModal from './components/RevisionPromptModal'
import RevisionHistoryPanel from './components/RevisionHistoryPanel'
import CheckoutModal from './components/CheckoutModal'
import AccessoryPromptModal from './components/AccessoryPromptModal'
import ConvertToAccessoryModal from './components/ConvertToAccessoryModal'
import AddAccessoryModal from './components/AddAccessoryModal'
import LoginScreen from './components/LoginScreen'
import CatalogView from './components/CatalogView'
import CatalogItemModal from './components/CatalogItemModal'
import PackagesView from './components/PackagesView'
import CatalogConflictModal from './components/CatalogConflictModal'
import LaborByPhaseReport from './components/LaborByPhaseReport'

export default function App() {
    // Auth state
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'synced', 'error'
    const syncTimer = React.useRef(null);

    // Auth listener
    useEffect(() => {
        if (!supabase) { setAuthLoading(false); return; }
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAuthLoading(false);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
        return () => subscription.unsubscribe();
    }, []);

    // Fetch team membership on login. `teamLoaded` flips true once the query
    // resolves (with or without a team) so dependent effects know they can run.
    const [teamLoaded, setTeamLoaded] = useState(false);
    useEffect(() => {
        if (!supabase || !session) { setTeam(null); setTeamLoaded(false); return; }
        setTeamLoaded(false);
        const fetchTeam = async () => {
            try {
                const { data: membership } = await supabase
                    .from('team_members')
                    .select('team_id, role')
                    .eq('user_id', session.user.id)
                    .limit(1)
                    .single();
                if (membership) {
                    const { data: teamData } = await supabase
                        .from('teams')
                        .select('id, name, invite_code')
                        .eq('id', membership.team_id)
                        .single();
                    if (teamData) {
                        setTeam({ ...teamData, role: membership.role });
                    }
                }
            } catch (e) {
                // No team membership — that's fine
            } finally {
                setTeamLoaded(true);
            }
        };
        fetchTeam();
    }, [session]);

    // Multi-project state
    const [projects, setProjects] = useState([]);
    const [activeProjectId, setActiveProjectId] = useState(null);
    const [showProjectsHome, setShowProjectsHome] = useState(true);
    const [showNewProjectModal, setShowNewProjectModal] = useState(false);
    const [showDashboardCatalog, setShowDashboardCatalog] = useState(false);
    const [dashboardCatalogTab, setDashboardCatalogTab] = useState('components');
    const [projectCatalogTab, setProjectCatalogTab] = useState('components');
    const [team, setTeam] = useState(null);
    const [showTeamModal, setShowTeamModal] = useState(false);
    const hasLoaded = React.useRef(false);
    const [editingProject, setEditingProject] = useState(null);
    const [showProjectSettings, setShowProjectSettings] = useState(false);
    const [showRevisionPrompt, setShowRevisionPrompt] = useState(false);
    const [viewingRevisionId, setViewingRevisionId] = useState(null);
    const [showRevisionHistory, setShowRevisionHistory] = useState(false);
    const [pendingRevisionProjectId, setPendingRevisionProjectId] = useState(null); // For revisions on non-active projects
    const [revisionPromptManualCreate, setRevisionPromptManualCreate] = useState(false);
    const [projectSearchTerm, setProjectSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState('active');
    
    // Current project state (when a project is open)
    const [tab, setTab] = useState('project');
    const [editPackageId, setEditPackageId] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [catalogSyncStatus, setCatalogSyncStatus] = useState('loading');
    const [catalogConflicts, setCatalogConflicts] = useState(null);
    const [catalogError, setCatalogError] = useState(null);
    const [uomOptions, setUomOptions] = useState(UOM_OPTIONS);
    const [packages, setPackages] = useState([]);
    
    // Catalog is server-authoritative. The DB (catalog_items) is the only source
    // of truth — fetch the canonical catalog from Supabase on every (session, team)
    // resolution. No localStorage primary, no version-bump refetch, no delta merge.
    useEffect(() => {
        if (!session || !teamLoaded) return;
        let cancelled = false;
        const run = async () => {
            setCatalogError(null);
            setCatalogSyncStatus('loading');
            try {
                if (!team) {
                    // No team → no shared catalog. UI surfaces a "join a team" gate.
                    setCatalog([]);
                    setCatalogSyncStatus('no-team');
                    return;
                }
                const items = await loadCatalogFromDb(team.id);
                if (cancelled) return;
                setCatalog(migrateCatalogPhases(items));
                setCatalogSyncStatus('synced');
            } catch (e) {
                if (cancelled) return;
                console.error('Failed to load catalog', e);
                setCatalogError(e?.message || 'Failed to load catalog');
                setCatalogSyncStatus('error');
            }
        };
        run();
        return () => { cancelled = true; };
    }, [session, team, teamLoaded]);

    // Subscribe to realtime catalog_items changes for the active team. Teammates'
    // INSERT/UPDATE/DELETE events apply directly to local state, so other windows
    // see new items / edits / deletions without a refresh. Echoes of this client's
    // own writes are idempotent — they just replace local state with the canonical
    // DB row, which is structurally equivalent to what's already there.
    useEffect(() => {
        if (!supabase || !session || !team) return;
        const applyChange = (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;
            if (eventType === 'DELETE') {
                const id = oldRow?.item_id;
                if (!id) return;
                setCatalog(prev => prev.filter(c => c.id !== id));
                return;
            }
            if (!newRow) return;
            const item = catalogRowToItem(newRow);
            setCatalog(prev => {
                const exists = prev.some(c => c.id === item.id);
                if (item.deleted) return exists ? prev.filter(c => c.id !== item.id) : prev;
                if (!exists) return [...prev, item];
                return prev.map(c => (c.id === item.id ? item : c));
            });
        };
        const channel = supabase
            .channel(`catalog_items:${team.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'catalog_items',
                filter: `team_id=eq.${team.id}`,
            }, applyChange)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [session, team]);

    // Manual refresh button — re-pull the canonical catalog from Supabase.
    const refreshCatalog = async () => {
        if (!session) return;
        if (!team) { showToast('Join a team to use the catalog'); return; }
        setCatalogError(null);
        setCatalogSyncStatus('loading');
        try {
            const items = await loadCatalogFromDb(team.id);
            setCatalog(migrateCatalogPhases(items));
            setCatalogSyncStatus('synced');
            showToast('Catalog refreshed');
        } catch (e) {
            console.error('Refresh failed', e);
            setCatalogError(e?.message || 'Refresh failed');
            setCatalogSyncStatus('error');
            showToast('Could not refresh catalog');
        }
    };

    // Renders the right panel depending on auth/team/load state.
    // Used at both catalog render sites (dashboard + project tab) so they
    // surface the same loading/error/no-team gates uniformly.
    const renderCatalogPanel = () => {
        if (catalogSyncStatus === 'no-team') {
            return (
                <div style={styles.emptyState}>
                    <p style={{ marginBottom: '16px' }}>Join or create a team to use the catalog.</p>
                    <button style={{ ...styles.smallButton, backgroundColor: '#1d9bf0', color: '#fff' }} onClick={() => setShowTeamModal(true)}>Team Settings</button>
                </div>
            );
        }
        if (catalogSyncStatus === 'loading' && catalog.length === 0) {
            return <div style={styles.emptyState}>Loading catalog…</div>;
        }
        if (catalogSyncStatus === 'error') {
            return (
                <div style={styles.emptyState}>
                    <p style={{ marginBottom: '16px' }}>Couldn't load catalog{catalogError ? `: ${catalogError}` : ''}.</p>
                    <button style={{ ...styles.smallButton, backgroundColor: '#1d9bf0', color: '#fff' }} onClick={refreshCatalog}>Retry</button>
                </div>
            );
        }
        return (
            <CatalogView
                catalog={catalog}
                onUpsertItem={upsertCatalogItem}
                onDeleteItem={deleteCatalogItem}
                onBulkUpsert={bulkUpsertCatalog}
                onBulkDelete={bulkDeleteCatalog}
                onRefreshCatalog={refreshCatalog}
                syncStatus={catalogSyncStatus}
                compactMode={compactMode}
                uomOptions={uomOptions}
                onUpdateUomOptions={setUomOptions}
            />
        );
    };
    
    // Seed packages from static JSON — only used for first-time setup when no data exists anywhere
    const seedPackagesFromStatic = async () => {
        try {
            const response = await fetch(getDataUrl(CONFIG.PACKAGES_FILE));
            if (response.ok) {
                const data = await response.json();
                if (data?.length > 0) {
                    setPackages(data);
                    return true;
                }
            }
        } catch (e) {
            console.log('Failed to fetch seed packages');
        }
        return false;
    };
    
    const [selected, setSelected] = useState(null);
    const [viewMode, setViewMode] = useState('single'); // 'single', 'all', or 'unfinished'
    const [workspaceSearch, setWorkspaceSearch] = useState(''); // Filter items in workspace views

    // Stable default project to prevent infinite re-renders
    const defaultProject = useMemo(() => ({ name: 'New Project', locations: [] }), []);

    // Get active project
    const project = projects.find(p => p.id === activeProjectId) || defaultProject;

    // Revision viewing: compute effective data (snapshot or live)
    const viewingRevision = useMemo(() => {
        if (!viewingRevisionId || !project.revisions) return null;
        return project.revisions.find(r => r.id === viewingRevisionId) || null;
    }, [viewingRevisionId, project.revisions]);
    const effectiveLocations = viewingRevision?.snapshot?.locations || project.locations;
    const effectivePackages = viewingRevision?.snapshot?.packages || project.packages;
    const isViewingHistory = !!viewingRevision;

    // Count placeholder items across all locations for the Unfinished badge
    const placeholderCount = useMemo(() => {
        let count = 0;
        const countInLocations = (locs) => {
            if (!locs) return;
            locs.forEach(loc => {
                if (loc.items) loc.items.forEach(item => { if (item.isPlaceholder) count++; });
                if (loc.children) countInLocations(loc.children);
            });
        };
        if (effectiveLocations) countInLocations(effectiveLocations);
        return count;
    }, [effectiveLocations]);
    const [compactMode, setCompactMode] = useState(true); // Compact layout toggle - default to compact
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('av-estimator-sidebar-width');
        return saved ? Math.max(200, Math.min(600, parseInt(saved))) : 360;
    });
    const sidebarResizing = React.useRef(false);
    const startSidebarResize = useCallback((e) => {
        e.preventDefault();
        sidebarResizing.current = true;
        const startX = e.clientX;
        const startWidth = sidebarWidth;
        const onMouseMove = (e) => {
            const newWidth = Math.max(200, Math.min(600, startWidth + (e.clientX - startX)));
            setSidebarWidth(newWidth);
        };
        const onMouseUp = () => {
            sidebarResizing.current = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Persist
            setSidebarWidth(w => { localStorage.setItem('av-estimator-sidebar-width', String(w)); return w; });
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);
    const [showSearch, setShowSearch] = useState(false);
    const [searchTargetLocation, setSearchTargetLocation] = useState(null); // For all-locations mode
    const [replaceContext, setReplaceContext] = useState(null); // { itemIdx, locationId, item, isPackage, packageName }
    const [showReplaceConfirm, setShowReplaceConfirm] = useState(null); // { replacement, original, locationId, isPackage, count }
    const [showAddLocation, setShowAddLocation] = useState(false);
    const [showAddSublocation, setShowAddSublocation] = useState(false);
    const [showDuplicate, setShowDuplicate] = useState(false);
    const [duplicateTarget, setDuplicateTarget] = useState(null); // Location to duplicate (null = use selected)
    const [showDelete, setShowDelete] = useState(false);
    const [moveModalLocations, setMoveModalLocations] = useState(null); // Array of locations to move
    const [clipboard, setClipboard] = useState([]);
    const [locationSearch, setLocationSearch] = useState('');
    const [expandedLocations, setExpandedLocations] = useState({});
    const [expandedWorkspaceLocations, setExpandedWorkspaceLocations] = useState({}); // For all-locations view
    const [templates, setTemplates] = useState([]);
    const [multiSelectLocations, setMultiSelectLocations] = useState([]);
    const lastMultiSelectLocRef = useRef(null);
    // Flat ordered list of visible locations in the tree (respects search + expand state)
    const flatVisibleLocations = useMemo(() => {
        const topLevel = locationSearch ? filterLocations(effectiveLocations, locationSearch) : effectiveLocations;
        const flatten = (locs) => {
            let result = [];
            for (const l of locs) {
                result.push(l);
                if (l.children?.length > 0 && expandedLocations[l.id]) {
                    result = result.concat(flatten(l.children));
                }
            }
            return result;
        };
        return flatten(topLevel);
    }, [effectiveLocations, locationSearch, expandedLocations]);
    const [deleteTargets, setDeleteTargets] = useState([]); // For delete modal - can be single or multiple
    const [showSavePackage, setShowSavePackage] = useState(false);
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);
    const [showApplyTemplate, setShowApplyTemplate] = useState(false);
    const [pendingPackageItems, setPendingPackageItems] = useState([]);
    const [pendingPackageIndices, setPendingPackageIndices] = useState([]);
    const [pendingPackageLocationId, setPendingPackageLocationId] = useState(null); // For all-locations mode
    const [toast, setToast] = useState(null);
    
    // Accessory modal states
    const [pendingComponents, setPendingComponents] = useState(null); // { comps, qty } - components waiting for accessory prompt
    const [accessoryPromptComponent, setAccessoryPromptComponent] = useState(null); // Component with accessories to prompt
    const [showConvertToAccessory, setShowConvertToAccessory] = useState(false);
    const [convertItemIdx, setConvertItemIdx] = useState(null);
    const [convertLocationId, setConvertLocationId] = useState(null); // For all-locations view
    const [showAddAccessoryModal, setShowAddAccessoryModal] = useState(false);
    const [addAccessoryItemIdx, setAddAccessoryItemIdx] = useState(null);
    const [addAccessoryLocationId, setAddAccessoryLocationId] = useState(null); // For all-locations view
    
    // BOM table resizable columns
    const { columns: bomCols, startResize: startBomResize } = useFlexibleColumns([
        { id: 'qty', label: 'Qty', width: 60 },
        { id: 'manufacturer', label: 'Manufacturer', width: 120 },
        { id: 'model', label: 'Model', width: 120 },
        { id: 'partNumber', label: 'Part Number', width: 130 },
        { id: 'description', label: 'Description', width: 220 },
        { id: 'phase', label: 'Phase', width: 150 },
        { id: 'unitCost', label: 'Unit Cost', width: 90 },
        { id: 'laborHrsPerUnit', label: 'Unit Labor', width: 90 },
        { id: 'extCost', label: 'Ext. Cost', width: 90 },
        { id: 'extLabor', label: 'Ext. Labor', width: 90 },
    ]);

    // Report state
    const [showLaborByPhase, setShowLaborByPhase] = useState(true);
    const [reportHierarchyDepth, setReportHierarchyDepth] = useState(-1);
    const [showBom, setShowBom] = useState(true);

    const [bomSortField, setBomSortField] = useState(null);
    const [bomSortDir, setBomSortDir] = useState('asc');
    const [bomSearch, setBomSearch] = useState('');
    const [bomCategoryFilter, setBomCategoryFilter] = useState('');
    const [bomEditingCell, setBomEditingCell] = useState(null); // 'key|field'
    const [bomEditingValue, setBomEditingValue] = useState(''); // local value while typing

    // History for undo/redo
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isUndoRedo = React.useRef(false);

    // Update project helper

    const setProjectDirect = (updater) => {
        setProjects(prev => prev.map(p => {
            if (p.id === activeProjectId) {
                const newProject = typeof updater === 'function' ? updater(p) : updater;
                return { ...newProject, updatedAt: new Date().toISOString(), updatedBy: session?.user?.email || '' };
            }
            return p;
        }));
    };

    // Returns false if the edit was blocked (read-only / viewing history / needs revision)
    const isProjectEditable = () => {
        if (projectReadOnly) {
            if (isViewingHistory) {
                showToast('Cannot edit — viewing a read-only revision', 'warning');
            } else {
                showToast('Project is read-only — checked out by ' + (checkedOutBy || 'another user'), 'warning');
            }
            return false;
        }
        if (isViewingHistory) {
            showToast('Cannot edit — viewing a historical revision', 'warning');
            return false;
        }
        return true;
    };

    const setProject = (updater) => {
        if (!isProjectEditable()) return false;
        setProjectDirect(updater);
        return true;
    };

    // Handle revision creation from the modal
    const createRevision = ({ label, notes }) => {
        // Snapshot current state BEFORE the pending mutation is applied
        // Determine which project to snapshot (active project, or a specific one from dashboard)
        const targetProjectId = pendingRevisionProjectId || activeProjectId;
        const currentProject = projects.find(p => p.id === targetProjectId);
        const snapshot = {
            locations: JSON.parse(JSON.stringify(currentProject?.locations || [])),
            packages: JSON.parse(JSON.stringify(currentProject?.packages || [])),
        };
        const revision = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            label,
            notes,
            createdAt: new Date().toISOString(),
            createdBy: session?.user?.email || 'unknown',
            snapshot,
        };
        // Add the revision to the project
        if (targetProjectId === activeProjectId) {
            setProjectDirect(p => ({
                ...p,
                revisions: [...(p.revisions || []), revision],
            }));
        } else {
            // Non-active project (e.g., status change from dashboard)
            setProjects(prev => prev.map(p =>
                p.id === targetProjectId ? {
                    ...p,
                    revisions: [...(p.revisions || []), revision],
                    updatedAt: new Date().toISOString(),
                    updatedBy: session?.user?.email || '',
                } : p
            ));
        }
        setPendingRevisionProjectId(null);

        // Log to Supabase for team changelog
        if (supabase && session && team && targetProjectId) {
            const revisionNumber = (currentProject?.revisions?.length || 0) + 1;
            supabase.from('project_revisions').insert({
                project_id: targetProjectId,
                team_id: team.id,
                user_id: session.user.id,
                user_email: session.user.email,
                revision_number: revisionNumber,
                note: `${label}${notes ? ': ' + notes : ''}`,
            }).then(({ error }) => {
                if (error) console.error('Revision log error:', error);
            });
        }

    };

    // Restore a historical revision
    const restoreRevision = (revisionId) => {
        const currentProject = projects.find(p => p.id === activeProjectId);
        const targetRevision = currentProject?.revisions?.find(r => r.id === revisionId);
        if (!targetRevision?.snapshot) return;

        // Snapshot current live state before overwriting
        const preRestoreSnapshot = {
            locations: JSON.parse(JSON.stringify(currentProject.locations || [])),
            packages: JSON.parse(JSON.stringify(currentProject.packages || [])),
        };
        const preRestoreRevision = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            label: 'Pre-restore snapshot',
            notes: `State before restoring "${targetRevision.label}"`,
            createdAt: new Date().toISOString(),
            createdBy: session?.user?.email || 'unknown',
            snapshot: preRestoreSnapshot,
        };

        // Apply: save pre-restore snapshot, then overwrite with target
        setProjectDirect(p => ({
            ...p,
            revisions: [...(p.revisions || []), preRestoreRevision],
            locations: JSON.parse(JSON.stringify(targetRevision.snapshot.locations)),
            packages: JSON.parse(JSON.stringify(targetRevision.snapshot.packages || [])),
        }));

        setViewingRevisionId(null);
        showToast(`Restored "${targetRevision.label}"`);
    };

    // Create new project
    const createProject = (projectData) => {
        const newProject = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: projectData.name || 'Untitled Project',
            client: projectData.client || '',
            status: 'developing',
            locations: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dueDate: projectData.dueDate || null,
            notes: projectData.notes || '',
            projectNumber: projectData.projectNumber || '',
            revisions: [],
            packages: [],
        };
        setProjects(prev => [newProject, ...prev]);
        return newProject.id;
    };
    
    // Open a project
    const [projectReadOnly, setProjectReadOnly] = useState(false);
    const [checkedOutBy, setCheckedOutBy] = useState(null);
    const [checkouts, setCheckouts] = useState({}); // { projectId: { email, userId } }
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [showCheckinModal, setShowCheckinModal] = useState(false);
    const [pendingOpenProjectId, setPendingOpenProjectId] = useState(null);
    const [selectedProjectId, setSelectedProjectId] = useState(null);

    // Fetch checkout status for all projects (when on dashboard)
    useEffect(() => {
        if (!supabase || !session || !team || !showProjectsHome) return;
        const fetchCheckouts = async () => {
            const { data } = await supabase
                .from('projects')
                .select('id, checked_out_by, checked_out_email')
                .eq('team_id', team.id)
                .not('checked_out_by', 'is', null);
            if (data) {
                const map = {};
                data.forEach(p => { map[p.id] = { email: p.checked_out_email, userId: p.checked_out_by }; });
                setCheckouts(map);
            }
        };
        fetchCheckouts();
    }, [showProjectsHome, session, team]);

    // Show checkout modal before opening a project (team mode only)
    const initiateOpenProject = (projectId) => {
        if (!supabase || !session || !team) {
            // No team — open directly without checkout
            openProjectDirect(projectId, false);
            return;
        }
        // Already checked out by me — open directly in edit mode
        const checkout = checkouts[projectId];
        if (checkout && checkout.userId === session.user.id) {
            openProjectDirect(projectId, false);
            return;
        }
        // Show the checkout modal
        setPendingOpenProjectId(projectId);
        setShowCheckoutModal(true);
    };

    // Actually open a project (called from modal or directly)
    const openProjectDirect = async (projectId, readOnly) => {
        setProjectReadOnly(readOnly);
        setCheckedOutBy(null);
        setShowCheckoutModal(false);
        setPendingOpenProjectId(null);

        if (!readOnly && supabase && session && team) {
            try {
                const { data: success } = await supabase.rpc('checkout_project', {
                    p_project_id: projectId,
                    p_email: session.user.email
                });
                if (success === false) {
                    // Race condition — someone grabbed it between modal and click
                    const { data: projRow } = await supabase
                        .from('projects')
                        .select('checked_out_email, checked_out_by')
                        .eq('id', projectId)
                        .single();
                    setProjectReadOnly(true);
                    setCheckedOutBy(projRow?.checked_out_email || 'another user');
                    showToast('Project was just checked out by ' + (projRow?.checked_out_email || 'another user') + ' — opening read-only');
                }
            } catch (e) {
                console.error('Checkout error:', e);
            }
        }

        setActiveProjectId(projectId);
        setShowProjectsHome(false);
        setSelected(null);
        setHistory([]);
        setHistoryIndex(-1);
        setViewingRevisionId(null);
    };

    // Open a project read-only at a specific revision (from dashboard revision row)
    const openRevision = (projectId, revisionId) => {
        setProjectReadOnly(true);
        setCheckedOutBy(null);
        setShowCheckoutModal(false);
        setPendingOpenProjectId(null);
        setActiveProjectId(projectId);
        setShowProjectsHome(false);
        setSelected(null);
        setHistory([]);
        setHistoryIndex(-1);
        setViewingRevisionId(revisionId);
    };

    // Show checkin modal before closing a project (team mode only)
    const initiateCloseProject = () => {
        if (!supabase || !session || !team || projectReadOnly) {
            // No team, or read-only — close directly without asking
            closeProjectDirect(false);
            return;
        }
        setShowCheckinModal(true);
    };

    // Actually close a project (called from modal or directly)
    const closeProjectDirect = async (doCheckin) => {
        setShowCheckinModal(false);
        if (doCheckin && supabase && session && activeProjectId) {
            try {
                await supabase.rpc('checkin_project', { p_project_id: activeProjectId });
            } catch (e) {
                console.error('Checkin error:', e);
            }
        }
        setActiveProjectId(null);
        setShowProjectsHome(true);
        setSelected(null);
        setProjectReadOnly(false);
        setCheckedOutBy(null);
        setViewingRevisionId(null);
    };

    // Admin force check-in — release another user's checkout
    const forceCheckinProject = async (projectId) => {
        if (!supabase || !session || !team) return;
        if (team.role !== 'owner' && team.role !== 'admin') {
            showToast('Only admins can force check-in');
            return;
        }
        const checkout = checkouts[projectId];
        if (!checkout) return;
        if (!confirm(`Force check in this project?\n\nThis will release the checkout held by ${checkout.email}. They may lose unsaved changes.`)) return;
        try {
            await supabase
                .from('projects')
                .update({ checked_out_by: null, checked_out_email: null, checked_out_at: null })
                .eq('id', projectId);
            setCheckouts(prev => {
                const next = { ...prev };
                delete next[projectId];
                return next;
            });
            showToast('Checkout released');
        } catch (e) {
            console.error('Force checkin error:', e);
            showToast('Failed to force check-in');
        }
    };
    
    // Duplicate a project
    const duplicateProject = (projectId) => {
        const source = projects.find(p => p.id === projectId);
        if (!source) return;
        const newProject = {
            ...JSON.parse(JSON.stringify(source)),
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: source.name + ' (Copy)',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'developing',
        };
        setProjects(prev => [newProject, ...prev]);
        showToast('Project duplicated');
    };
    
    // Delete a project
    const deleteProject = (projectId) => {
        setProjects(prev => prev.filter(p => p.id !== projectId));
        if (activeProjectId === projectId) {
            closeProjectDirect(true);
        }
        // Delete from Supabase
        if (supabase && session) {
            supabase.from('projects').delete().eq('id', projectId).then(({ error }) => {
                if (error) console.error('Failed to delete from Supabase:', error);
            });
        }
        showToast('Project deleted');
    };
    
    // Update project status
    const updateProjectStatus = (projectId, newStatus) => {
        setProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, status: newStatus, updatedAt: new Date().toISOString(), updatedBy: session?.user?.email || '' } : p
        ));
    };

    // Create revision from dashboard context menu
    const handleDashboardCreateRevision = (proj) => {
        setPendingRevisionProjectId(proj.id);
        setRevisionPromptManualCreate(true);
        setShowRevisionPrompt(true);
    };

    // Save project (for editing)
    const saveProject = (updatedProject) => {
        setProjects(prev => prev.map(p =>
            p.id === updatedProject.id ? { ...updatedProject, updatedAt: new Date().toISOString(), updatedBy: session?.user?.email || '' } : p
        ));
        showToast('Project updated');
    };
    
    // Calculate project totals
    const getProjectTotals = (proj) => {
        let cost = 0, labor = 0, items = 0;
        const catalogPkgs = packages;
        const projectPkgs = proj.packages || [];
        const calc = (locs) => {
            for (const loc of locs) {
                if (loc.items) {
                    const flatItems = getFlattenedItems(loc, catalogPkgs, projectPkgs);
                    for (const item of flatItems) {
                        cost += (item.qty || 0) * (item.unitCost || 0);
                        labor += (item.qty || 0) * (item.laborHrsPerUnit || 0);
                        items += 1;
                        if (item.accessories) {
                            for (const acc of item.accessories) {
                                cost += (acc.qty || 0) * (acc.unitCost || 0);
                                labor += (acc.qty || 0) * (acc.laborHrsPerUnit || 0);
                                items += 1;
                            }
                        }
                    }
                }
                if (loc.children) calc(loc.children);
            }
        };
        calc(proj.locations || []);
        return { cost, labor, items };
    };

    // Auto-save catalog mutations. Pattern for each: optimistic local state update,
    // immediate Supabase write, revert + toast on error. The "Save Changes" button
    // is gone — every per-action mutation persists itself.
    const requireTeam = () => {
        if (!session) return false;
        if (!team) { showToast('Join a team to use the catalog', 'warning'); return false; }
        return true;
    };

    const upsertCatalogItem = async (item) => {
        if (!requireTeam()) return;
        const stamped = { ...item, modifiedAt: new Date().toISOString() };
        const prev = catalog;
        const exists = prev.some(c => c.id === stamped.id);
        const next = exists
            ? prev.map(c => (c.id === stamped.id ? stamped : c))
            : [...prev, stamped];
        setCatalog(next);
        setCatalogSyncStatus('saving');
        try {
            await upsertCatalogItemRemote(team.id, stamped, session.user.id);
            setCatalogSyncStatus('synced');
        } catch (e) {
            console.error('Catalog upsert failed', e);
            setCatalog(prev);
            setCatalogSyncStatus('error');
            showToast('Could not save change — try again', 'warning');
        }
    };

    const deleteCatalogItem = async (itemId) => {
        if (!requireTeam()) return;
        const prev = catalog;
        setCatalog(prev.map(c => (c.id === itemId ? { ...c, deleted: true } : c)));
        setCatalogSyncStatus('saving');
        try {
            await deleteCatalogItemRemote(team.id, itemId, session.user.id);
            setCatalogSyncStatus('synced');
        } catch (e) {
            console.error('Catalog delete failed', e);
            setCatalog(prev);
            setCatalogSyncStatus('error');
            showToast('Could not delete — try again', 'warning');
        }
    };

    const bulkUpsertCatalog = async (items) => {
        if (!requireTeam()) return;
        if (!items?.length) return;
        const now = new Date().toISOString();
        const stamped = items.map(i => ({ ...i, modifiedAt: now }));
        const idMap = {};
        stamped.forEach(i => { idMap[i.id] = i; });
        const prev = catalog;
        const existingIds = new Set(prev.map(c => c.id));
        const next = prev.map(c => idMap[c.id] || c);
        stamped.forEach(i => { if (!existingIds.has(i.id)) next.push(i); });
        setCatalog(next);
        setCatalogSyncStatus('saving');
        try {
            await bulkUpsertCatalogRemote(team.id, stamped, session.user.id);
            setCatalogSyncStatus('synced');
        } catch (e) {
            console.error('Catalog bulk upsert failed', e);
            setCatalog(prev);
            setCatalogSyncStatus('error');
            showToast('Could not save changes — try again', 'warning');
        }
    };

    const bulkDeleteCatalog = async (itemIds) => {
        if (!requireTeam()) return;
        if (!itemIds?.length) return;
        const idSet = new Set(itemIds);
        const prev = catalog;
        setCatalog(prev.map(c => (idSet.has(c.id) ? { ...c, deleted: true } : c)));
        setCatalogSyncStatus('saving');
        try {
            await bulkDeleteCatalogRemote(team.id, itemIds, session.user.id);
            setCatalogSyncStatus('synced');
        } catch (e) {
            console.error('Catalog bulk delete failed', e);
            setCatalog(prev);
            setCatalogSyncStatus('error');
            showToast('Could not delete — try again', 'warning');
        }
    };

    // Debounced auto-save to Supabase (skip until initial load completes).
    useEffect(() => {
        if (!hasLoaded.current) return;
        if (supabase && session) {
            clearTimeout(syncTimer.current);
            syncTimer.current = setTimeout(async () => {
                setSyncStatus('syncing');
                try {
                    // Upsert each project
                    for (const p of projects) {
                        const { error } = await supabase.from('projects').upsert({
                            id: p.id,
                            user_id: session.user.id,
                            team_id: team?.id || null,
                            data: p,
                            updated_at: p.updatedAt || new Date().toISOString(),
                        });
                        if (error) throw error;
                    }
                    // Sync packages/templates/uom_options
                    await supabase.from('user_settings').upsert({
                        user_id: session.user.id,
                        team_id: team?.id || null,
                        packages,
                        templates,
                        uom_options: uomOptions,
                        updated_at: new Date().toISOString(),
                    });
                    setSyncStatus('synced');
                } catch (err) {
                    console.error('Sync error:', err);
                    setSyncStatus('error');
                }
            }, 500);
        }
    }, [projects, packages, templates, uomOptions, activeProjectId, viewingRevisionId, projectReadOnly, team]);

    // Manual save (Ctrl+S / Save button) — immediate Supabase sync.
    const saveNow = React.useCallback(async () => {
        if (!hasLoaded.current) return;
        clearTimeout(syncTimer.current);
        if (supabase && session) {
            setSyncStatus('syncing');
            try {
                for (const p of projects) {
                    const { error } = await supabase.from('projects').upsert({
                        id: p.id,
                        user_id: session.user.id,
                        team_id: team?.id || null,
                        data: p,
                        updated_at: p.updatedAt || new Date().toISOString(),
                    });
                    if (error) throw error;
                }
                await supabase.from('user_settings').upsert({
                    user_id: session.user.id,
                    team_id: team?.id || null,
                    packages,
                    templates,
                    uom_options: uomOptions,
                    updated_at: new Date().toISOString(),
                });
                setSyncStatus('synced');
                showToast('Project saved ✓');
            } catch (err) {
                console.error('Save error:', err);
                setSyncStatus('error');
                showToast('Save failed — check your connection');
            }
        } else {
            showToast('Sign in to save');
        }
    }, [projects, packages, templates, uomOptions, team, supabase, session]);

    // Server-authoritative load of projects/packages/templates. Runs once
    // session + team query both resolve. Sets `hasLoaded.current = true` only
    // after a successful load so the auto-save effect doesn't fire empty state.
    useEffect(() => {
        if (!supabase || !session || !teamLoaded) return;
        const syncFromSupabase = async () => {
            setSyncStatus('syncing');
            try {
                // Pull remote projects — Supabase wins
                let projQuery = supabase.from('projects').select('id, data, updated_at');
                if (team) {
                    projQuery = projQuery.eq('team_id', team.id);
                } else {
                    projQuery = projQuery.eq('user_id', session.user.id);
                }
                const { data: remoteRows, error: projErr } = await projQuery;
                if (!projErr && remoteRows?.length > 0) {
                    const remote = migrateProjectPhases(remoteRows.map(r => r.data));
                    // Supabase is authoritative: start with remote, add any local-only projects
                    setProjects(prev => {
                        const remoteIds = new Set(remote.map(p => p.id));
                        const localOnly = prev.filter(p => !remoteIds.has(p.id));
                        return [...remote, ...localOnly];
                    });
                }

                // Pull remote packages/templates/uom_options — Supabase is authoritative
                let settQuery = supabase.from('user_settings').select('packages, templates, uom_options');
                if (team) {
                    settQuery = settQuery.eq('team_id', team.id);
                } else {
                    settQuery = settQuery.eq('user_id', session.user.id);
                }
                const { data: settings } = await settQuery.maybeSingle();
                if (settings) {
                    if (settings.packages?.length > 0) {
                        // Supabase packages are the source of truth — replace local
                        setPackages(migratePackagePhases(settings.packages));
                    } else {
                        // Supabase has no packages — seed from static file if local is also empty
                        setPackages(prev => {
                            if (prev.length === 0) { seedPackagesFromStatic(); }
                            return prev;
                        });
                    }
                    if (settings.templates && Object.keys(settings.templates).length > 0) setTemplates(settings.templates);
                    if (Array.isArray(settings.uom_options) && settings.uom_options.length > 0) {
                        setUomOptions(settings.uom_options);
                    }
                } else {
                    // No user_settings row at all — first time user, seed packages
                    setPackages(prev => {
                        if (prev.length === 0) { seedPackagesFromStatic(); }
                        return prev;
                    });
                }

                // Catalog has its own server-authoritative load effect (see catalog_items).
                setSyncStatus('synced');
                hasLoaded.current = true;
            } catch (err) {
                console.error('Supabase sync error:', err);
                setSyncStatus('error');
                showToast('Could not reach server — refresh to retry', 'warning');
            }
        };
        syncFromSupabase();
    }, [session, team, teamLoaded]);

    // Save to history for undo
    useEffect(() => {
        if (!isUndoRedo.current && activeProjectId && project.locations?.length > 0) {
            setHistory(prev => {
                const newHist = prev.slice(0, historyIndex + 1);
                newHist.push(JSON.stringify(project));
                return newHist.slice(-30); // Keep last 30 states
            });
            setHistoryIndex(prev => Math.min(prev + 1, 29));
        }
        isUndoRedo.current = false;
    }, [activeProjectId, projects]);
    
    const undo = () => {
        if (historyIndex > 0) {
            isUndoRedo.current = true;
            setHistoryIndex(historyIndex - 1);
            const restored = JSON.parse(history[historyIndex - 1]);
            setProject(restored);
            if (selected) {
                const findLoc = (locs, id) => { for (const l of (locs || [])) { if (l.id === id) return l; if (l.children) { const f = findLoc(l.children, id); if (f) return f; } } return null; };
                setSelected(findLoc(restored.locations, selected.id) || null);
            }
            showToast('Undo');
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            isUndoRedo.current = true;
            setHistoryIndex(historyIndex + 1);
            const restored = JSON.parse(history[historyIndex + 1]);
            setProject(restored);
            if (selected) {
                const findLoc = (locs, id) => { for (const l of (locs || [])) { if (l.id === id) return l; if (l.children) { const f = findLoc(l.children, id); if (f) return f; } } return null; };
                setSelected(findLoc(restored.locations, selected.id) || null);
            }
            showToast('Redo');
        }
    };
    
    const showToast = (msg, type) => {
        setToast(type ? { msg, type } : msg);
        setTimeout(() => setToast(null), 2000);
    };

    // Export to Esticom - one xlsx per location
    const exportToEsticom = () => {
        const sanitizeFilename = (str) => {
            return str.replace(/[<>:"/\\|?*]/g, '-').replace(/\s*>\s*/g, ' - ').trim();
        };

        if (reportHierarchyDepth !== -1) {
            // Grouped export: one file per hierarchy group with merged items
            const groups = getGroupedByHierarchy(effectiveLocations, reportHierarchyDepth, packages, effectivePackages || []);
            if (groups.length === 0) { showToast('No locations with components to export'); return; }
            groups.forEach((group, index) => {
                setTimeout(() => {
                    // Merge all items from all locations in this group into a virtual location
                    const mergedItems = [];
                    for (const loc of group.locations) {
                        const flat = getFlattenedItems(loc, packages, effectivePackages || []);
                        mergedItems.push(...flat);
                    }
                    const virtualLocation = { name: group.name, items: mergedItems };
                    const wb = generateEsticomWorkbook(virtualLocation, packages, effectivePackages);
                    const filename = sanitizeFilename(group.name) + '.xlsx';
                    XLSX.writeFile(wb, filename);
                }, index * 150);
            });
            showToast(`Exporting ${groups.length} Esticom file${groups.length > 1 ? 's' : ''} (grouped)...`);
        } else {
            // Default: per leaf location
            const locationsWithItems = getLocationsWithItems(effectiveLocations);
            if (locationsWithItems.length === 0) { showToast('No locations with components to export'); return; }
            locationsWithItems.forEach((location, index) => {
                setTimeout(() => {
                    const wb = generateEsticomWorkbook(location, packages, effectivePackages);
                    const filename = sanitizeFilename(location.path || location.name) + '.xlsx';
                    XLSX.writeFile(wb, filename);
                }, index * 150);
            });
            showToast(`Exporting ${locationsWithItems.length} Esticom file${locationsWithItems.length > 1 ? 's' : ''}...`);
        }
    };

    const buildConsolidatedBOMSheet = (locsList) => {
        const partMap = {};
        for (const location of locsList) {
            const flatItems = getFlattenedItems(location, packages, project.packages);
            for (const item of flatItems) {
                const key = item.partNumber || (item.manufacturer + '|' + item.model);
                if (partMap[key]) { partMap[key].qty += (item.qty || 0); }
                else { partMap[key] = { qty: item.qty || 0, model: item.model || '', manufacturer: item.manufacturer || '', supplier: item.vendor || '', partNumber: item.partNumber || '', uom: item.uom || 'EA', unitCost: item.unitCost || 0, phase: item.phase || '' }; }
                if (item.accessories) {
                    for (const acc of item.accessories) {
                        const accKey = acc.partNumber || (acc.manufacturer + '|' + acc.model);
                        if (partMap[accKey]) { partMap[accKey].qty += (acc.qty || 0); }
                        else { partMap[accKey] = { qty: acc.qty || 0, model: acc.model || '', manufacturer: acc.manufacturer || '', supplier: acc.vendor || '', partNumber: acc.partNumber || '', uom: acc.uom || 'EA', unitCost: acc.unitCost || 0, phase: acc.phase || '' }; }
                    }
                }
            }
        }
        return partMap;
    };

    const exportConsolidatedBOM = () => {
        const projectName = (project.name || 'Project').replace(/[<>:"/\\|?*]/g, '-').trim();

        // Always export as single file, single sheet with all project items consolidated
        const locationsWithItems = getLocationsWithItems(effectiveLocations);
        if (locationsWithItems.length === 0) { showToast('No locations with components to export'); return; }
        const partMap = buildConsolidatedBOMSheet(locationsWithItems);
        const wb = XLSX.utils.book_new();
        const data = [[], ['BILL OF MATERIALS - ' + projectName, '', '', '', '', '', '', '', ''], [], [], ['QTY', 'Model', 'Manufacturer', 'Supplier', 'Part Number', 'UOM', 'Item Cost', 'Total Cost', 'Phase'], []];
        for (const part of Object.values(partMap)) { data.push([part.qty, part.model, part.manufacturer, part.supplier, part.partNumber, part.uom, part.unitCost, (part.qty || 0) * (part.unitCost || 0), part.phase]); }
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
        ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Bill of materials');
        XLSX.writeFile(wb, projectName + ' - Consolidated BOM.xlsx');
        showToast('Consolidated BOM exported');
    };

    // Export Technician BOM as PDF - per-location item list grouped by report hierarchy
    const exportTechnicianBOM = () => {
      try {
        const projectName = (project.name || 'Project').trim();

        let groups;
        if (reportHierarchyDepth === -1) {
            // Entire Project: single consolidated BOM
            const allLocs = getLocationsWithItems(effectiveLocations);
            groups = allLocs.length > 0 ? [{ name: projectName + ' — Consolidated BOM', locations: allLocs }] : [];
        } else {
            groups = getGroupedByHierarchy(effectiveLocations, reportHierarchyDepth, packages, effectivePackages || []);
        }

        if (groups.length === 0) { showToast('No locations with components to export'); return; }

        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
        let firstPage = true;

        for (const group of groups) {
            // Consolidate items by unique key
            const partMap = {};
            const partOrder = [];
            const addItem = (item) => {
                const key = item.partNumber || ((item.manufacturer || '') + '|' + (item.model || ''));
                if (partMap[key]) {
                    partMap[key].qty += (item.qty || 0);
                } else {
                    partMap[key] = { qty: item.qty || 0, manufacturer: item.manufacturer || '', model: item.model || '', partNumber: item.partNumber || '', description: item.description || '' };
                    partOrder.push(key);
                }
            };
            for (const loc of group.locations) {
                const flat = getFlattenedItems(loc, packages, effectivePackages || []);
                for (const item of flat) {
                    addItem(item);
                    if (item.accessories) {
                        for (const acc of item.accessories) addItem(acc);
                    }
                }
            }
            if (partOrder.length === 0) continue;

            if (!firstPage) doc.addPage();
            firstPage = false;

            // Header
            doc.setFontSize(10);
            doc.setTextColor(120);
            doc.text(projectName, 40, 30);
            doc.setFontSize(16);
            doc.setTextColor(0);
            doc.text(group.name, 40, 52);

            const rows = partOrder.map(key => partMap[key]);
            rows.sort((a, b) => (a.manufacturer || '').localeCompare(b.manufacturer || '', undefined, { sensitivity: 'base' }));
            const bodyData = rows.map(p => [p.qty, p.manufacturer, p.model, p.partNumber, p.description]);

            autoTable(doc, {
                startY: 65,
                head: [['QTY', 'Manufacturer', 'Model', 'Part Number', 'Description']],
                body: bodyData,
                margin: { left: 40, right: 40 },
                styles: { fontSize: 9, cellPadding: 4, lineColor: [200, 200, 200], lineWidth: 0.5 },
                headStyles: { fillColor: [41, 50, 60], textColor: 255, fontStyle: 'bold' },
                bodyStyles: { fillColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [235, 238, 242] },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 40 },
                    1: { cellWidth: 120 },
                    2: { cellWidth: 140 },
                    3: { cellWidth: 120 },
                    4: { cellWidth: 'auto' },
                },
            });
        }

        if (firstPage) { showToast('No locations with components to export'); return; }

        const safeFilename = projectName.replace(/[<>:"/\\|?*]/g, '-');
        doc.save(safeFilename + ' - Technician BOM.pdf');
        showToast(`Technician BOM exported (${groups.length} location${groups.length !== 1 ? 's' : ''})`);
      } catch (err) {
        console.error('Technician BOM export error:', err);
        showToast('Export failed: ' + (err.message || 'Unknown error'));
      }
    };

    // Export complete estimate in Procore Estimating import format
    const exportProcoreEstimate = () => {
        const projectName = (project.name || 'Project').replace(/[<>:"/\\|?*]/g, '-').trim();
        const wb = generateProcoreEstimateWorkbook(effectiveLocations, packages, effectivePackages, projectName);
        if (!wb) { showToast('No locations with components to export'); return; }
        XLSX.writeFile(wb, projectName + ' - Procore Estimate Import.xlsx');
        showToast('Procore Estimating import file exported');
    };

    // Build consolidated BOM data for the in-app view
    const getConsolidatedBOM = () => {
        const locationsWithItems = getLocationsWithItems(effectiveLocations);
        const partMap = {};
        for (const location of locationsWithItems) {
            const flatItems = getFlattenedItems(location, packages, effectivePackages);
            for (const item of flatItems) {
                const key = item.partNumber || (item.manufacturer + '|' + item.model);
                if (partMap[key]) {
                    partMap[key].totalQty += (item.qty || 0);
                    if (!partMap[key].locations.includes(location.path || location.name)) partMap[key].locations.push(location.path || location.name);
                } else {
                    partMap[key] = {
                        key,
                        totalQty: item.qty || 0,
                        manufacturer: item.manufacturer || '',
                        model: item.model || '',
                        partNumber: item.partNumber || '',
                        description: item.description || '',
                        category: item.category || '',
                        unitCost: item.unitCost || 0,
                        laborHrsPerUnit: item.laborHrsPerUnit || 0,
                        uom: item.uom || 'EA',
                        vendor: item.vendor || '',
                        phase: item.phase || '',
                        locations: [location.path || location.name],
                    };
                }
                if (item.accessories) {
                    for (const acc of item.accessories) {
                        const accKey = acc.partNumber || (acc.manufacturer + '|' + acc.model);
                        if (partMap[accKey]) {
                            partMap[accKey].totalQty += (acc.qty || 0);
                            if (!partMap[accKey].locations.includes(location.path || location.name)) partMap[accKey].locations.push(location.path || location.name);
                        } else {
                            partMap[accKey] = {
                                key: accKey,
                                totalQty: acc.qty || 0,
                                manufacturer: acc.manufacturer || '',
                                model: acc.model || '',
                                partNumber: acc.partNumber || '',
                                description: acc.description || '',
                                category: acc.category || '',
                                unitCost: acc.unitCost || 0,
                                laborHrsPerUnit: acc.laborHrsPerUnit || 0,
                                uom: acc.uom || 'EA',
                                vendor: acc.vendor || '',
                                phase: acc.phase || '',
                                locations: [location.path || location.name],
                            };
                        }
                    }
                }
            }
        }
        return Object.values(partMap).sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.manufacturer || '').localeCompare(b.manufacturer || ''));
    };

    // Update unit cost or labor across all matching items in all locations (and package definitions)
    const updateConsolidatedField = (partKey, field, value) => {
        // Always update local editing value so the input reflects what user typed
        setBomEditingValue(value);
        // Don't propagate intermediate typing states (e.g. "", "0.", "0.0", "0.00")
        if (value === '' || /\.$/.test(value) || /\.\d*0$/.test(value)) return;
        const numVal = parseFloat(value);
        if (isNaN(numVal) || numVal < 0) return;
        const updateLocs = (locs) => locs.map(loc => {
            let items = loc.items;
            if (items) {
                items = items.map(item => {
                    if (item.type === 'package') return item; // Package instances are read-only; update the definitions instead
                    const itemKey = item.partNumber || (item.manufacturer + '|' + item.model);
                    let updatedItem = itemKey === partKey ? { ...item, [field]: numVal } : item;
                    if (updatedItem.accessories) {
                        updatedItem = { ...updatedItem, accessories: updatedItem.accessories.map(acc => {
                            const accKey = acc.partNumber || (acc.manufacturer + '|' + acc.model);
                            return accKey === partKey ? { ...acc, [field]: numVal } : acc;
                        })};
                    }
                    return updatedItem;
                });
            }
            const children = loc.children ? updateLocs(loc.children) : loc.children;
            return { ...loc, items, children };
        });
        // Also update matching items within package definitions (catalog + project)
        const updatePkgItems = (pkgs) => pkgs.map(pkg => ({
            ...pkg,
            items: (pkg.items || []).map(item => {
                const itemKey = item.partNumber || (item.manufacturer + '|' + item.model);
                let updatedItem = itemKey === partKey ? { ...item, [field]: numVal } : item;
                if (updatedItem.accessories) {
                    updatedItem = { ...updatedItem, accessories: updatedItem.accessories.map(acc => {
                        const accKey = acc.partNumber || (acc.manufacturer + '|' + acc.model);
                        return accKey === partKey ? { ...acc, [field]: numVal } : acc;
                    })};
                }
                return updatedItem;
            }),
        }));
        if (!isProjectEditable()) return;
        setPackages(prev => updatePkgItems(prev));
        setProject(p => ({
            ...p,
            locations: updateLocs(p.locations),
            packages: p.packages ? updatePkgItems(p.packages) : p.packages,
        }));
    };

    // Update phase across all matching items in all locations (and package definitions)
    const updateConsolidatedPhase = (partKey, phase) => {
        if (!isProjectEditable()) return;
        // Find indices of items in a package definition that match partKey
        const matchingPkgItemIndices = (pkgDef) =>
            (pkgDef.items || []).reduce((acc, item, idx) => {
                const itemKey = item.partNumber || (item.manufacturer + '|' + item.model);
                if (itemKey === partKey) acc.push(idx);
                return acc;
            }, []);
        const updateLocs = (locs, projectPkgs) => locs.map(loc => {
            let items = loc.items;
            if (items) {
                items = items.map(item => {
                    if (item.type === 'package') {
                        // Update itemOverrides.phase for matching items in this instance
                        const allDefs = [...(packages || []), ...(projectPkgs || [])];
                        const def = allDefs.find(d => d.id === item.packageId);
                        if (!def) return item;
                        const indices = matchingPkgItemIndices(def);
                        if (indices.length === 0) return item;
                        const overrides = { ...(item.itemOverrides || {}) };
                        indices.forEach(idx => { overrides[idx] = { ...(overrides[idx] || {}), phase }; });
                        return { ...item, itemOverrides: overrides };
                    }
                    const itemKey = item.partNumber || (item.manufacturer + '|' + item.model);
                    let updatedItem = itemKey === partKey ? { ...item, phase } : item;
                    if (updatedItem.accessories) {
                        updatedItem = { ...updatedItem, accessories: updatedItem.accessories.map(acc => {
                            const accKey = acc.partNumber || (acc.manufacturer + '|' + acc.model);
                            return accKey === partKey ? { ...acc, phase } : acc;
                        })};
                    }
                    return updatedItem;
                });
            }
            const children = loc.children ? updateLocs(loc.children, projectPkgs) : loc.children;
            return { ...loc, items, children };
        });
        const updatePkgItems = (pkgs) => pkgs.map(pkg => ({
            ...pkg,
            items: (pkg.items || []).map(item => {
                const itemKey = item.partNumber || (item.manufacturer + '|' + item.model);
                let updatedItem = itemKey === partKey ? { ...item, phase } : item;
                if (updatedItem.accessories) {
                    updatedItem = { ...updatedItem, accessories: updatedItem.accessories.map(acc => {
                        const accKey = acc.partNumber || (acc.manufacturer + '|' + acc.model);
                        return accKey === partKey ? { ...acc, phase } : acc;
                    })};
                }
                return updatedItem;
            }),
        }));
        setPackages(prev => updatePkgItems(prev));
        setProject(p => ({
            ...p,
            locations: updateLocs(p.locations, p.packages),
            packages: p.packages ? updatePkgItems(p.packages) : p.packages,
        }));
    };

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNow(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (!showSearch && activeProjectId && !showProjectsHome) {
                    setShowSearch(true);
                }
            }
            if (e.key === 'Escape') {
                // Close any open modals first
                const hasOpenModal = showSearch || showAddLocation || showAddSublocation || showDuplicate || showDelete || showSavePackage || showSaveTemplate || showApplyTemplate;
                if (hasOpenModal) {
                    setShowSearch(false); setShowAddLocation(false); setShowAddSublocation(false);
                    setShowDuplicate(false); setDuplicateTarget(null); setShowDelete(false); setShowSavePackage(false);
                    setShowSaveTemplate(false); setShowApplyTemplate(false);
                } else if (clipboard.length > 0) {
                    // If no modals open, clear clipboard
                    setClipboard([]);
                    showToast('Clipboard cleared');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [historyIndex, history, clipboard, showSearch, showAddLocation, showAddSublocation, showDuplicate, showDelete, showSavePackage, showSaveTemplate, showApplyTemplate, activeProjectId, showProjectsHome, saveNow]);

    // Initialize expanded state when locations change
    useEffect(() => {
        const getAllIds = (locs) => {
            let ids = {};
            locs.forEach(l => {
                ids[l.id] = true;
                if (l.children) ids = { ...ids, ...getAllIds(l.children) };
            });
            return ids;
        };
        setExpandedLocations(prev => {
            const allIds = getAllIds(project.locations);
            // Keep existing state, add new locations as expanded
            const newState = { ...prev };
            Object.keys(allIds).forEach(id => {
                if (!(id in newState)) newState[id] = true;
            });
            return newState;
        });
    }, [project.locations]);

    const expandAll = () => {
        const getAllIds = (locs) => {
            let ids = {};
            locs.forEach(l => { ids[l.id] = true; if (l.children) ids = { ...ids, ...getAllIds(l.children) }; });
            return ids;
        };
        setExpandedLocations(getAllIds(project.locations));
    };

    const collapseAll = () => {
        setExpandedLocations({});
    };

    const toggleExpand = (id) => {
        setExpandedLocations(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const getDepth = (id, locations = effectiveLocations, depth = 0) => {
        for (const loc of locations) {
            if (loc.id === id) return depth;
            if (loc.children) { const found = getDepth(id, loc.children, depth + 1); if (found !== -1) return found; }
        }
        return -1;
    };

    const addLocations = (names, parentId) => {
        if (!isProjectEditable()) return;
        const newLocs = names.map(name => ({ id: Date.now().toString() + Math.random().toString(36).substr(2, 9), name, children: [], items: [] }));
        if (!parentId) {
            setProject(p => ({ ...p, locations: [...p.locations, ...newLocs] }));
        } else {
            const addToParent = locs => locs.map(l => l.id === parentId ? { ...l, children: [...(l.children || []), ...newLocs] } : l.children ? { ...l, children: addToParent(l.children) } : l);
            if (!setProject(p => ({ ...p, locations: addToParent(p.locations) }))) return;
            if (selected?.id === parentId) setSelected(s => ({ ...s, children: [...(s.children || []), ...newLocs] }));
        }
    };

    const deleteLocation = (id) => {
        const removeFromTree = locs => locs.filter(l => l.id !== id).map(l => l.children ? { ...l, children: removeFromTree(l.children) } : l);
        if (!setProject(p => ({ ...p, locations: removeFromTree(p.locations) }))) return;
        if (selected?.id === id) setSelected(null);
    };

    const sortLocations = () => {
        const sortTree = locs => sortLocationsAlpha(locs).map(l => l.children?.length > 0 ? { ...l, children: sortTree(l.children) } : l);
        setProject(p => ({ ...p, locations: sortTree(p.locations) }));
    };

    const duplicateStructure = (location, newNames, includeItems = true) => {
        const newLocs = newNames.map(name => cloneStructure(location, name, includeItems));
        
        // Find parent of the location being duplicated and add siblings there
        const addSiblings = (locs, targetId, newSiblings) => {
            // Check if target is at this level
            const idx = locs.findIndex(l => l.id === targetId);
            if (idx !== -1) {
                // Found it - insert new locations after it
                const result = [...locs];
                result.splice(idx + 1, 0, ...newSiblings);
                return result;
            }
            // Check children
            return locs.map(l => {
                if (l.children?.length > 0) {
                    const childIdx = l.children.findIndex(c => c.id === targetId);
                    if (childIdx !== -1) {
                        const newChildren = [...l.children];
                        newChildren.splice(childIdx + 1, 0, ...newSiblings);
                        return { ...l, children: newChildren };
                    }
                    return { ...l, children: addSiblings(l.children, targetId, newSiblings) };
                }
                return l;
            });
        };
        
        if (!setProject(p => ({ ...p, locations: addSiblings(p.locations, location.id, newLocs) }))) return;
        const itemText = includeItems ? ' with components' : '';
        showToast(`Created ${newNames.length} location${newNames.length > 1 ? 's' : ''}${itemText}`);
    };
    
    // Move location up within its current level
    const moveLocationUp = (locationId) => {
        const moveUp = (locs) => {
            const idx = locs.findIndex(l => l.id === locationId);
            if (idx > 0) {
                const newLocs = [...locs];
                [newLocs[idx - 1], newLocs[idx]] = [newLocs[idx], newLocs[idx - 1]];
                return newLocs;
            }
            return locs.map(l => l.children?.length > 0 ? { ...l, children: moveUp(l.children) } : l);
        };
        setProject(p => ({ ...p, locations: moveUp(p.locations) }));
    };
    
    // Move location down within its current level
    const moveLocationDown = (locationId) => {
        const moveDown = (locs) => {
            const idx = locs.findIndex(l => l.id === locationId);
            if (idx !== -1 && idx < locs.length - 1) {
                const newLocs = [...locs];
                [newLocs[idx], newLocs[idx + 1]] = [newLocs[idx + 1], newLocs[idx]];
                return newLocs;
            }
            return locs.map(l => l.children?.length > 0 ? { ...l, children: moveDown(l.children) } : l);
        };
        setProject(p => ({ ...p, locations: moveDown(p.locations) }));
    };
    
    // Promote location (move up one level - make it a sibling of its parent)
    const promoteLocation = (locationId) => {
        let locationToMove = null;
        let parentId = null;
        
        // Find the location and its parent
        const findLocationAndParent = (locs, parent = null) => {
            for (const loc of locs) {
                if (loc.id === locationId) {
                    locationToMove = loc;
                    parentId = parent?.id;
                    return true;
                }
                if (loc.children?.length > 0 && findLocationAndParent(loc.children, loc)) {
                    return true;
                }
            }
            return false;
        };
        
        findLocationAndParent(project.locations);
        
        if (!locationToMove || !parentId) {
            showToast('Cannot promote top-level location');
            return;
        }
        
        // Remove from current parent and add as sibling of parent
        const promote = (locs) => {
            // First, find and remove from parent's children
            const removeFromParent = (locs) => {
                return locs.map(l => {
                    if (l.id === parentId) {
                        return { ...l, children: l.children.filter(c => c.id !== locationId) };
                    }
                    if (l.children?.length > 0) {
                        return { ...l, children: removeFromParent(l.children) };
                    }
                    return l;
                });
            };
            
            // Then add as sibling after parent
            const addAfterParent = (locs) => {
                const idx = locs.findIndex(l => l.id === parentId);
                if (idx !== -1) {
                    const newLocs = [...locs];
                    newLocs.splice(idx + 1, 0, locationToMove);
                    return newLocs;
                }
                return locs.map(l => l.children?.length > 0 ? { ...l, children: addAfterParent(l.children) } : l);
            };
            
            return addAfterParent(removeFromParent(locs));
        };
        
        setProject(p => ({ ...p, locations: promote(p.locations) }));
        showToast(`Promoted "${locationToMove.name}"`);
    };
    
    // Demote location (move down one level - make it a child of the previous sibling)
    const demoteLocation = (locationId) => {
        const demote = (locs) => {
            const idx = locs.findIndex(l => l.id === locationId);
            if (idx > 0) {
                // Has a previous sibling - demote into it
                const locationToMove = locs[idx];
                const newLocs = locs.filter((_, i) => i !== idx);
                newLocs[idx - 1] = {
                    ...newLocs[idx - 1],
                    children: [...(newLocs[idx - 1].children || []), locationToMove]
                };
                return newLocs;
            }
            // Check children
            return locs.map(l => l.children?.length > 0 ? { ...l, children: demote(l.children) } : l);
        };
        
        const loc = findLocation(project.locations, locationId);
        setProject(p => ({ ...p, locations: demote(p.locations) }));
        if (loc) showToast(`Demoted "${loc.name}"`);
    };

    const moveLocationTo = (targetId) => {
        // targetId is null for top-level, or a location ID to move into
        if (!moveModalLocations || moveModalLocations.length === 0) return;
        const movingIds = new Set(moveModalLocations.map(l => l.id));

        const removeLocations = (locs) => {
            const removed = [];
            const remaining = [];
            for (const l of locs) {
                if (movingIds.has(l.id)) {
                    removed.push(l);
                } else {
                    const childResult = l.children?.length > 0 ? removeLocations(l.children) : { remaining: l.children || [], removed: [] };
                    remaining.push({ ...l, children: childResult.remaining });
                    removed.push(...childResult.removed);
                }
            }
            return { remaining, removed };
        };

        setProject(p => {
            const { remaining, removed } = removeLocations(p.locations);
            if (removed.length === 0) return p;

            if (targetId === null) {
                // Move to top level
                return { ...p, locations: [...remaining, ...removed] };
            }
            // Insert into target's children
            const insertInto = (locs) => locs.map(l => {
                if (l.id === targetId) {
                    return { ...l, children: [...(l.children || []), ...removed] };
                }
                return l.children?.length > 0 ? { ...l, children: insertInto(l.children) } : l;
            });
            return { ...p, locations: insertInto(remaining) };
        });

        const names = moveModalLocations.map(l => l.name).join(', ');
        showToast(`Moved ${names}`);
        setMoveModalLocations(null);
    };

    const updateItems = (id, items) => {
        const upd = locs => locs.map(l => l.id === id ? { ...l, items } : l.children ? { ...l, children: upd(l.children) } : l);
        if (!setProject(p => ({ ...p, locations: upd(p.locations) }))) return;
        if (selected?.id === id) setSelected(s => ({ ...s, items }));
    };

    const renameLocation = (id, newName) => {
        const upd = locs => locs.map(l => l.id === id ? { ...l, name: newName } : l.children ? { ...l, children: upd(l.children) } : l);
        if (!setProject(p => ({ ...p, locations: upd(p.locations) }))) return;
        if (selected?.id === id) setSelected(s => ({ ...s, name: newName }));
        showToast(`Renamed to "${newName}"`);
    };

    // Discontinued item warning
    const [discontinuedWarning, setDiscontinuedWarning] = useState(null);

    const checkDiscontinuedAndInsert = (comps, qty) => {
        const discontinued = comps.filter(c => c.discontinued);
        if (discontinued.length > 0) {
            setDiscontinuedWarning({ comps, qty, discontinued });
        } else {
            insertComps(comps, qty);
        }
    };

    // Check if any components have accessories that need prompting
    const insertComps = (comps, qty) => {
        // Determine target location - searchTargetLocation for all-locations mode, otherwise selected
        const targetLocationId = searchTargetLocation || (selected ? selected.id : null);
        const targetLocation = targetLocationId ? findLocation(project.locations, targetLocationId) : null;
        
        if (!targetLocation) return;
        
        // Find components with default accessories
        const compsWithAccessories = comps.filter(c => c.defaultAccessories?.length > 0);
        
        if (compsWithAccessories.length > 0) {
            // Store pending components and show prompt for first one
            setPendingComponents({ comps, qty, currentIdx: 0, processedItems: [], targetLocationId });
            setAccessoryPromptComponent(compsWithAccessories[0]);
        } else {
            // No accessories, just add directly
            const newItems = comps.map(c => ({ ...c, qty }));
            updateItems(targetLocationId, [...(targetLocation.items || []), ...newItems]); 
        }
        setSearchTargetLocation(null); // Clear after use
    };
    
    // Handle accessory prompt response
    const handleAccessoryPromptConfirm = (includedAccessories) => {
        if (!pendingComponents || !accessoryPromptComponent) return;
        
        const { comps, qty, currentIdx, processedItems, targetLocationId } = pendingComponents;
        const targetLocation = findLocation(project.locations, targetLocationId || (selected ? selected.id : null));
        
        if (!targetLocation) return;
        
        // Add current component with selected accessories
        const item = { ...accessoryPromptComponent, qty };
        if (includedAccessories.length > 0) {
            item.accessories = includedAccessories;
        }
        const newProcessedItems = [...processedItems, item];
        
        // Find next component with accessories
        const compsWithAccessories = comps.filter(c => c.defaultAccessories?.length > 0);
        const nextIdx = currentIdx + 1;
        
        if (nextIdx < compsWithAccessories.length) {
            // More components with accessories to prompt
            setPendingComponents({ comps, qty, currentIdx: nextIdx, processedItems: newProcessedItems, targetLocationId });
            setAccessoryPromptComponent(compsWithAccessories[nextIdx]);
        } else {
            // All done - add all items including ones without accessories
            const compsWithoutAccessories = comps.filter(c => !c.defaultAccessories?.length);
            const itemsWithoutAccessories = compsWithoutAccessories.map(c => ({ ...c, qty }));
            const allItems = [...newProcessedItems, ...itemsWithoutAccessories];
            
            updateItems(targetLocationId || selected.id, [...(targetLocation.items || []), ...allItems]);
            setPendingComponents(null);
            setAccessoryPromptComponent(null);
        }
    };
    
    // Cancel accessory prompt - add items without any accessories
    const handleAccessoryPromptCancel = () => {
        if (pendingComponents) {
            const { comps, qty, targetLocationId } = pendingComponents;
            const locId = targetLocationId || (selected ? selected.id : null);
            const targetLocation = locId ? findLocation(project.locations, locId) : null;
            if (targetLocation) {
                const newItems = comps.map(c => ({ ...c, qty }));
                updateItems(locId, [...(targetLocation.items || []), ...newItems]);
            }
        }
        setPendingComponents(null);
        setAccessoryPromptComponent(null);
    };
    
    // Convert item to accessory of another item
    const handleConvertToAccessory = (locationIdOrItemIdx, itemIdx) => {
        // If only one arg, it's itemIdx (single view mode)
        // If two args, first is locationId, second is itemIdx (all locations view)
        if (itemIdx === undefined) {
            setConvertItemIdx(locationIdOrItemIdx);
            setConvertLocationId(null);
        } else {
            setConvertLocationId(locationIdOrItemIdx);
            setConvertItemIdx(itemIdx);
        }
        setShowConvertToAccessory(true);
    };
    
    const confirmConvertToAccessory = (itemIdx, parentIdx) => {
        const targetLocation = convertLocationId ? findLocation(project.locations, convertLocationId) : selected;
        if (!targetLocation) return;
        const items = [...targetLocation.items];
        const itemToConvert = items[itemIdx];
        const parentItem = items[parentIdx];
        
        // Adjust indices if item comes before parent
        const adjustedParentIdx = itemIdx < parentIdx ? parentIdx - 1 : parentIdx;
        
        // Remove item from main list first
        const filteredItems = items.filter((_, i) => i !== itemIdx);
        
        // Add as accessory to parent
        const newAccessory = { ...itemToConvert, qtyPer: itemToConvert.qty };
        filteredItems[adjustedParentIdx] = {
            ...filteredItems[adjustedParentIdx],
            accessories: [...(filteredItems[adjustedParentIdx].accessories || []), newAccessory]
        };
        
        updateItems(targetLocation.id, filteredItems);
        setShowConvertToAccessory(false);
        setConvertItemIdx(null);
        setConvertLocationId(null);
        showToast('Item converted to accessory');
    };
    
    // Add accessory to existing item
    const handleAddAccessoryToItem = (locationIdOrItemIdx, itemIdx) => {
        // If only one arg, it's itemIdx (single view mode)
        // If two args, first is locationId, second is itemIdx (all locations view)
        if (itemIdx === undefined) {
            setAddAccessoryItemIdx(locationIdOrItemIdx);
            setAddAccessoryLocationId(null);
        } else {
            setAddAccessoryLocationId(locationIdOrItemIdx);
            setAddAccessoryItemIdx(itemIdx);
        }
        setShowAddAccessoryModal(true);
    };
    
    const confirmAddAccessory = (accessory) => {
        const targetLocation = addAccessoryLocationId ? findLocation(project.locations, addAccessoryLocationId) : selected;
        if (!targetLocation || addAccessoryItemIdx === null) return;
        const items = [...targetLocation.items];
        items[addAccessoryItemIdx] = {
            ...items[addAccessoryItemIdx],
            accessories: [...(items[addAccessoryItemIdx].accessories || []), accessory]
        };
        updateItems(targetLocation.id, items);
        setShowAddAccessoryModal(false);
        setAddAccessoryItemIdx(null);
        setAddAccessoryLocationId(null);
        showToast('Accessory added');
    };
    
    // Ungroup a package - remove packageName from all items in the package
    const handleUngroupPackage = (packageName, locationId) => {
        const targetId = locationId || (selected ? selected.id : null);
        const targetLoc = targetId ? findLocation(project.locations, targetId) : null;
        if (!targetLoc) return;
        const newItems = [];
        for (const item of targetLoc.items) {
            if (item.type === 'package' && item.packageName === packageName) {
                // New-style package: expand into individual items
                const resolved = resolvePackageInstance(item, packages, effectivePackages);
                if (resolved && !resolved.isMissing) {
                    resolved.expandedItems.forEach(ei => {
                        const { qtyPerPackage, ...rest } = ei;
                        newItems.push(rest);
                    });
                }
            } else if (item.packageName === packageName) {
                // Legacy package: just strip packageName
                const { packageName: _, ...rest } = item;
                newItems.push(rest);
            } else {
                newItems.push(item);
            }
        }
        updateItems(targetId, newItems);
        showToast(`Package "${packageName}" ungrouped`);
    };
    
    // Move item to an existing package
    const handleMoveToPackage = (itemIdx, packageName) => {
        if (!selected) return;
        const items = [...selected.items];
        items[itemIdx] = { ...items[itemIdx], packageName };
        updateItems(selected.id, items);
        showToast(`Item moved to "${packageName}"`);
    };
    
    const insertPkg = (pkg, qty) => {
        const targetLocationId = searchTargetLocation || (selected ? selected.id : null);
        const targetLocation = targetLocationId ? findLocation(project.locations, targetLocationId) : null;
        if (targetLocation) {
            const newInstance = {
                type: 'package',
                packageId: pkg.id,
                packageName: pkg.name,
                packageVersion: pkg.version || 1,
                qty: qty,
                notes: '',
            };
            updateItems(targetLocationId, [...(targetLocation.items || []), newInstance]);
        }
        setSearchTargetLocation(null);
    };
    const handleCopy = (items) => { setClipboard(items); showToast(`${items.length} item${items.length > 1 ? 's' : ''} copied`); };
    const handlePaste = (locationId) => {
        if (clipboard.length === 0) return;
        const loc = findLocation(project.locations, locationId);
        if (loc) updateItems(locationId, [...(loc.items || []), ...clipboard.map(item => ({ ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) }))]);
    };
    
    // "Add to Catalog" from the project right-click menu. Opens the full
    // catalog-item modal pre-filled with the component's fields so the user
    // can review/complete the details before persisting.
    const [addToCatalogContext, setAddToCatalogContext] = useState(null); // { prefill, sourceItem, locationId, itemIdx } | null

    const handleAddToCatalog = (item, locationId, itemIdx) => {
        const exists = catalog.find(c =>
            (c.partNumber && c.partNumber === item.partNumber) ||
            (c.manufacturer === item.manufacturer && c.model === item.model)
        );
        if (exists && !exists.deleted) {
            showToast('Item already exists in catalog');
            return;
        }
        setAddToCatalogContext({
            prefill: {
                manufacturer: item.manufacturer || '',
                model: item.model || '',
                partNumber: item.partNumber || '',
                description: item.description || '',
                category: item.category || '',
                subcategory: item.subcategory || '',
                unitCost: item.unitCost || 0,
                laborHrsPerUnit: item.laborHrsPerUnit || 0,
                uom: item.uom || 'EA',
                vendor: item.vendor || '',
                discontinued: false,
                phase: item.phase || '',
            },
            sourceItem: item,
            locationId,
            itemIdx,
        });
    };

    // Modal save: persist to Supabase via auto-save, and if the source row
    // was a placeholder/empty item, replace it with the new catalog version.
    const handleAddToCatalogSave = (newItem) => {
        const ctx = addToCatalogContext;
        upsertCatalogItem(newItem);
        if (ctx?.sourceItem?.isPlaceholder && ctx.locationId != null && ctx.itemIdx != null) {
            const loc = findLocation(project.locations, ctx.locationId);
            if (loc) {
                const updatedItems = [...loc.items];
                updatedItems[ctx.itemIdx] = {
                    ...newItem,
                    qty: ctx.sourceItem.qty || 1,
                    notes: ctx.sourceItem.notes || '',
                    phase: ctx.sourceItem.phase || '',
                    accessories: ctx.sourceItem.accessories || [],
                };
                updateItems(ctx.locationId, updatedItems);
            }
        }
        showToast(`Added "${newItem.manufacturer} ${newItem.model}" to catalog`);
    };
    
    const handleUpdateFromCatalog = (item, locationId, itemIdx) => {
        // Find matching catalog entry by id first, then partNumber, then manufacturer+model
        const catalogItem = catalog.find(c => !c.deleted && (
            c.id === item.id ||
            (c.partNumber && item.partNumber && c.partNumber === item.partNumber) ||
            (c.manufacturer === item.manufacturer && c.model === item.model)
        ));
        if (!catalogItem) {
            showToast('No matching catalog item found');
            return;
        }
        const loc = findLocation(project.locations, locationId);
        if (!loc) return;
        const updatedItems = [...loc.items];
        updatedItems[itemIdx] = {
            // Preserve project-specific fields
            qty: item.qty,
            notes: item.notes || '',
            phase: item.phase || '',
            accessories: item.accessories || [],
            // Overwrite with latest catalog fields
            ...catalogItem,
        };
        updateItems(locationId, updatedItems);
        showToast(`Updated "${catalogItem.manufacturer} ${catalogItem.model}" from catalog`);
    };

    // Replace item handlers
    const handleReplaceItem = (itemIdx, locationId) => {
        const loc = findLocation(project.locations, locationId || selected?.id);
        if (!loc) return;
        const item = loc.items[itemIdx];
        setReplaceContext({ itemIdx, locationId: locationId || selected.id, item, isPackage: false });
        setShowSearch(true);
    };

    const handleReplacePackage = (packageName, itemIdx, locationId) => {
        const loc = findLocation(project.locations, locationId || selected?.id);
        if (!loc) return;
        const item = loc.items[itemIdx];
        setReplaceContext({ itemIdx, locationId: locationId || selected.id, item, isPackage: true, packageName });
        setShowSearch(true);
    };

    const handleReplaceSelect = (replacement) => {
        if (!replaceContext) return;
        setShowSearch(false);
        // Count how many locations have this item
        let count = 0;
        const countInLocations = (locs) => {
            if (!locs) return;
            locs.forEach(loc => {
                if (loc.items) {
                    loc.items.forEach(item => {
                        if (replaceContext.isPackage) {
                            if (item.type === 'package' && item.packageId === replaceContext.item.packageId) count++;
                        } else {
                            if (item.id === replaceContext.item.id) count++;
                        }
                    });
                }
                if (loc.children) countInLocations(loc.children);
            });
        };
        countInLocations(project.locations);

        if (count > 1) {
            setShowReplaceConfirm({ replacement, original: replaceContext.item, locationId: replaceContext.locationId, isPackage: replaceContext.isPackage, count });
        } else {
            executeReplace(replacement, 'this', replaceContext.locationId, replaceContext.isPackage);
            setReplaceContext(null);
        }
    };

    const executeReplace = (replacement, scope, locationId, isPackage) => {
        const replaceInLocation = (loc) => {
            if (!loc.items) return loc;
            const newItems = loc.items.map(item => {
                if (isPackage) {
                    if (item.type === 'package' && item.packageId === replaceContext.item.packageId) {
                        return { ...replacement, qty: item.qty, notes: item.notes };
                    }
                } else {
                    if (item.id === replaceContext.item.id) {
                        return { ...replacement, qty: item.qty, notes: item.notes, system: item.system, accessories: item.accessories };
                    }
                }
                return item;
            });
            return { ...loc, items: newItems };
        };

        if (scope === 'this') {
            const loc = findLocation(project.locations, locationId);
            if (loc) updateItems(locationId, replaceInLocation(loc).items);
        } else {
            // Replace in all locations
            const replaceRecursive = (locs) => locs.map(loc => {
                let updated = replaceInLocation(loc);
                if (updated.children) updated = { ...updated, children: replaceRecursive(updated.children) };
                return updated;
            });
            const newLocations = replaceRecursive(project.locations);
            setProjects(prev => prev.map(p => p.id === project.id ? { ...p, locations: newLocations, updatedAt: new Date().toISOString() } : p));
        }
        showToast(`Replaced ${isPackage ? 'package' : 'item'} ${scope === 'all' ? 'in all locations' : ''}`);
    };

    const handleSavePackage = (items, indices) => {
        setPendingPackageItems(items);
        setPendingPackageIndices(indices || []);
        setShowSavePackage(true);
    };
    
    const savePackage = (name, scope = 'catalog') => {
        const pkgId = generatePackageId();
        const newPkg = {
            id: pkgId,
            name,
            scope,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: pendingPackageItems.map(i => {
                const { packageName: _, ...rest } = i;
                return { ...rest, qtyPerPackage: i.qty || 1 };
            }),
        };

        if (scope === 'catalog') {
            setPackages(p => [...p, newPkg]);
        } else {
            setProjectDirect(p => ({
                ...p,
                packages: [...(p.packages || []), newPkg],
            }));
        }

        // Replace selected items with a single package instance
        const targetLocationId = pendingPackageLocationId || (selected ? selected.id : null);
        const targetLocation = targetLocationId ? findLocation(project.locations, targetLocationId) : null;

        if (targetLocation && pendingPackageIndices.length > 0) {
            const newInstance = {
                type: 'package',
                packageId: pkgId,
                packageName: name,
                packageVersion: 1,
                qty: 1,
                notes: '',
            };
            const remainingItems = targetLocation.items.filter((_, idx) => !pendingPackageIndices.includes(idx));
            updateItems(targetLocationId, [...remainingItems, newInstance]);
        }

        setShowSavePackage(false);
        setPendingPackageItems([]);
        setPendingPackageIndices([]);
        setPendingPackageLocationId(null);
        showToast(`Package "${name}" saved as ${scope} package`);
    };
    
    const handleSaveTemplate = () => {
        if (selected && selected.items?.length > 0) setShowSaveTemplate(true);
    };
    
    const saveTemplate = (name) => {
        const newTpl = { id: Date.now().toString(), name, items: selected.items.map(i => ({ ...i })) };
        setTemplates(t => [...t, newTpl]);
        setShowSaveTemplate(false);
        showToast(`Template "${name}" saved`);
    };
    
    const applyTemplate = (template) => {
        if (selected && template) {
            const newItems = template.items.map(i => ({ ...i, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) }));
            updateItems(selected.id, [...(selected.items || []), ...newItems]);
            showToast(`Template "${template.name}" applied`);
        }
    };

    const findLocation = (locs, id) => {
        for (const loc of locs) {
            if (loc.id === id) return loc;
            if (loc.children) { const found = findLocation(loc.children, id); if (found) return found; }
        }
        return null;
    };

    const selectedDepth = selected ? getDepth(selected.id) : -1;
    const projectTotals = (effectiveLocations || []).reduce((acc, loc) => { const t = calculateTotals(loc, packages, effectivePackages); return { cost: acc.cost + t.cost, labor: acc.labor + t.labor, itemCount: acc.itemCount + t.itemCount }; }, { cost: 0, labor: 0, itemCount: 0 });

    // Auth gate
    if (authLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#8b98a5', fontSize: '16px' }}>
                Loading...
            </div>
        );
    }
    if (supabase && !session) {
        return <LoginScreen onAuth={setSession} />;
    }

    // Show projects home if no project is open
    if (showProjectsHome) {
        if (showDashboardCatalog) {
            return (
                <div style={styles.app}>
                    <header style={{ ...styles.header, borderBottom: '1px solid #2f3336', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                                style={{ ...styles.iconButton, color: '#8b98a5' }}
                                onClick={() => { setShowDashboardCatalog(false); setDashboardCatalogTab('components'); }}
                                title="Back to Projects">
                                <Icons.ChevronDown style={{ transform: 'rotate(90deg)' }} />
                            </button>
                            <div style={styles.logo}>
                                <Icons.Layers /> Catalog
                            </div>
                        </div>
                        <nav style={{ display: 'flex', gap: '4px' }}>
                            <button style={styles.navButton(dashboardCatalogTab === 'components')} onClick={() => setDashboardCatalogTab('components')}>Components</button>
                            <button style={styles.navButton(dashboardCatalogTab === 'packages')} onClick={() => setDashboardCatalogTab('packages')}>Packages ({packages.length})</button>
                        </nav>
                    </header>
                    <main style={{ ...styles.main, padding: '16px 24px' }}>
                        {dashboardCatalogTab === 'components' && (
                            renderCatalogPanel()
                        )}
                        {dashboardCatalogTab === 'packages' && (
                            <PackagesView
                                catalogPackages={packages}
                                projectPackages={[]}
                                onUpdateCatalogPackages={setPackages}
                                onUpdateProjectPackages={() => {}}
                                catalog={catalog}
                                locations={[]}
                                compactMode={compactMode}
                            />
                        )}
                    </main>
                    {toast && <div style={styles.toast}>{typeof toast === 'object' ? toast.msg : toast}</div>}
                </div>
            );
        }
        return (
            <>
                <ProjectsHome
                    projects={projects}
                    onOpen={initiateOpenProject}
                    onOpenRevision={openRevision}
                    onCreate={() => setShowNewProjectModal(true)}
                    onOpenCatalog={() => setShowDashboardCatalog(true)}
                    onOpenTeam={() => setShowTeamModal(true)}
                    team={team}
                    checkouts={checkouts}
                    onEdit={(project) => setEditingProject(project)}
                    onDuplicate={duplicateProject}
                    onDelete={deleteProject}
                    onUpdateStatus={updateProjectStatus}
                    onCreateRevision={handleDashboardCreateRevision}
                    getProjectTotals={getProjectTotals}
                    searchTerm={projectSearchTerm}
                    onSearchChange={setProjectSearchTerm}
                    filter={projectFilter}
                    onFilterChange={setProjectFilter}
                    session={session}
                    syncStatus={syncStatus}
                    onLogout={() => { supabase && supabase.auth.signOut(); }}
                    onForceCheckin={forceCheckinProject}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={setSelectedProjectId}
                    packages={packages}
                />
                {showNewProjectModal && (
                    <NewProjectModal
                        onClose={() => setShowNewProjectModal(false)}
                        onCreate={(data) => {
                            const id = createProject(data);
                            openProjectDirect(id, false);
                        }}
                    />
                )}
                {editingProject && (
                    <EditProjectModal
                        project={editingProject}
                        onClose={() => setEditingProject(null)}
                        onSave={(updatedProject) => {
                            saveProject(updatedProject);
                            setEditingProject(null);
                        }}
                        onViewRevision={(revId) => {
                            openProjectDirect(editingProject.id, true);
                            setViewingRevisionId(revId);
                            setEditingProject(null);
                        }}
                    />
                )}
                {showTeamModal && (
                    <TeamModal
                        team={team}
                        session={session}
                        onClose={() => setShowTeamModal(false)}
                        onTeamUpdate={(newTeam) => { setTeam(newTeam); if (newTeam) showToast(`Team: ${newTeam.name}`); }}
                    />
                )}
                {addToCatalogContext && (
                    <CatalogItemModal
                        item={addToCatalogContext.prefill}
                        onClose={() => setAddToCatalogContext(null)}
                        onSave={handleAddToCatalogSave}
                        categories={catalog}
                        catalog={catalog}
                        uomOptions={uomOptions}
                        onUpdateUomOptions={setUomOptions}
                    />
                )}
                {showCheckoutModal && pendingOpenProjectId && (() => {
                    const proj = projects.find(p => p.id === pendingOpenProjectId);
                    const checkout = checkouts[pendingOpenProjectId];
                    const isOther = checkout && checkout.userId !== session?.user?.id;
                    return (
                        <CheckoutModal
                            mode="checkout"
                            projectName={proj?.name || 'Project'}
                            checkedOutBy={checkout?.email}
                            isCheckedOutByOther={isOther}
                            onCheckout={() => openProjectDirect(pendingOpenProjectId, false)}
                            onReadOnly={() => openProjectDirect(pendingOpenProjectId, true)}
                            onClose={() => { setShowCheckoutModal(false); setPendingOpenProjectId(null); }}
                        />
                    );
                })()}
                {showRevisionPrompt && (
                    <RevisionPromptModal
                        project={pendingRevisionProjectId ? (projects.find(p => p.id === pendingRevisionProjectId) || project) : project}
                        onClose={() => { setShowRevisionPrompt(false); setPendingRevisionProjectId(null); setRevisionPromptManualCreate(false); }}
                        onCreateRevision={createRevision}
                        manualCreate={revisionPromptManualCreate}
                    />
                )}
                {toast && <div style={styles.toast}>{typeof toast === 'object' ? toast.msg : toast}</div>}
            </>
        );
    }

    return (
        <div style={styles.app}>
            <header style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        style={{ ...styles.iconButton, color: '#8b98a5' }}
                        onClick={initiateCloseProject}
                        title="Back to Projects">
                        <Icons.ChevronLeft />
                    </button>
                    <div style={styles.logo}><Icons.Zap /> {project.name}</div>
                    {projectReadOnly && (
                        <span style={{ ...styles.badge(''), backgroundColor: isViewingHistory ? '#1d3a5c' : '#3d1a1a', color: isViewingHistory ? '#1d9bf0' : '#f87171', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {isViewingHistory ? (
                                <><Icons.RotateCcw /> Viewing Revision: {viewingRevision?.label}</>
                            ) : (
                                <><Icons.Lock /> Read-Only — checked out by {checkedOutBy}</>
                            )}
                        </span>
                    )}
                    {project.client && <span style={{ color: '#6e767d', fontSize: '14px' }}>• {project.client}</span>}
                    {project.status && (
                        <span style={{ ...styles.badge(''), backgroundColor: PROJECT_STATUSES[project.status]?.bg, color: PROJECT_STATUSES[project.status]?.color }}>
                            {PROJECT_STATUSES[project.status]?.label}
                        </span>
                    )}
                    {project.revisions?.length > 0 && (
                        <span
                            style={{ ...styles.badge(''), backgroundColor: '#3d2e1a', color: '#f59e0b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="View revision history"
                            onClick={() => setShowRevisionHistory(true)}
                        >
                            <Icons.Clock />
                            {project.revisions.length} Rev{project.revisions.length > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button style={{ ...styles.iconButton, opacity: historyIndex <= 0 || isViewingHistory ? 0.3 : 1 }} onClick={undo} disabled={historyIndex <= 0 || isViewingHistory} title="Undo (Ctrl+Z)"><Icons.Undo /></button>
                        <button style={{ ...styles.iconButton, opacity: historyIndex >= history.length - 1 || isViewingHistory ? 0.3 : 1 }} onClick={redo} disabled={historyIndex >= history.length - 1 || isViewingHistory} title="Redo (Ctrl+Y)"><Icons.Redo /></button>
                        <button style={{ ...styles.iconButton, color: syncStatus === 'syncing' ? '#f59e0b' : '#8b98a5' }} onClick={saveNow} title="Save (Ctrl+S)"><Icons.Save /></button>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', backgroundColor: '#2f3336', borderRadius: '6px', padding: '2px' }}>
                        <button 
                            style={{ ...styles.iconButton, backgroundColor: !compactMode ? '#1d9bf0' : 'transparent', color: !compactMode ? '#fff' : '#8b98a5', borderRadius: '4px' }} 
                            onClick={() => setCompactMode(false)} 
                            title="Comfortable view">
                            <Icons.Comfortable />
                        </button>
                        <button 
                            style={{ ...styles.iconButton, backgroundColor: compactMode ? '#1d9bf0' : 'transparent', color: compactMode ? '#fff' : '#8b98a5', borderRadius: '4px' }} 
                            onClick={() => setCompactMode(true)} 
                            title="Compact view">
                            <Icons.Compact />
                        </button>
                    </div>
                    <nav style={styles.nav}>
                        {['project', 'catalog', 'packages', 'reports'].map(t => (
                            <button key={t} style={styles.navButton(tab === t)} onClick={() => setTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                        ))}
                    </nav>
                </div>
            </header>

            {isViewingHistory && viewingRevision && (
                <div style={{
                    padding: '10px 24px',
                    background: 'linear-gradient(90deg, #3d2e1a 0%, #4a3520 100%)',
                    borderBottom: '2px solid #f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '14px',
                    color: '#f59e0b',
                    zIndex: 99,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icons.Clock />
                        <strong>Viewing: {viewingRevision.label}</strong>
                        <span style={{ color: '#8b98a5', fontSize: '12px' }}>
                            ({new Date(viewingRevision.createdAt).toLocaleDateString()})
                        </span>
                        <span style={{ ...styles.badge('orange'), fontSize: '10px' }}>READ-ONLY</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            style={{ ...styles.smallButton, backgroundColor: '#f59e0b', color: '#000', fontWeight: '600' }}
                            onClick={() => {
                                if (projectReadOnly && !checkedOutBy) {
                                    // Opened revision from dashboard — go back to dashboard
                                    closeProjectDirect(false);
                                } else {
                                    setViewingRevisionId(null);
                                }
                            }}>
                            {projectReadOnly && !checkedOutBy ? 'Back to Projects' : 'Return to Current'}
                        </button>
                        {!projectReadOnly && (
                        <button
                            style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c' }}
                            onClick={() => {
                                if (confirm(`Restore "${viewingRevision.label}"?\n\nYour current state will be saved as a revision first.`)) {
                                    restoreRevision(viewingRevisionId);
                                }
                            }}>
                            <Icons.RotateCcw /> Restore This Revision
                        </button>
                        )}
                    </div>
                </div>
            )}

            {clipboard.length > 0 && (
                <div style={styles.clipboardBanner}>
                    <span><Icons.Clipboard /> {clipboard.length} component{clipboard.length > 1 ? 's' : ''} copied</span>
                    <button style={{ ...styles.smallButton, backgroundColor: 'transparent', color: '#00ba7c' }} onClick={() => setClipboard([])}><Icons.X /> Clear</button>
                </div>
            )}

            <main style={styles.main}>
                {tab === 'project' && (
                    <>
                        <aside style={{ ...styles.sidebar, width: sidebarWidth + 'px', position: 'relative' }}>
                            <div style={styles.sidebarHeader}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#8b98a5', textTransform: 'uppercase', letterSpacing: '1px' }}>Locations</span>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button style={{ ...styles.iconButton, color: '#8b98a5' }} onClick={expandAll} title="Expand All"><Icons.ChevronsDown /></button>
                                        <button style={{ ...styles.iconButton, color: '#8b98a5' }} onClick={collapseAll} title="Collapse All"><Icons.ChevronsUp /></button>
                                        <button style={{ ...styles.iconButton, color: '#8b98a5' }} onClick={sortLocations} title="Sort A-Z"><Icons.SortAZ /></button>
                                    </div>
                                </div>
                                {projectTotals.itemCount > 0 && (
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                                        <span style={{ color: '#00ba7c' }}><Icons.DollarSign /> {fmtCost(projectTotals.cost)}</span>
                                        <span style={{ color: '#1d9bf0' }}><Icons.Clock /> {formatHours(projectTotals.labor)}</span>
                                    </div>
                                )}
                            </div>

                            <div style={styles.sidebarSearch}>
                                <div style={{ position: 'relative' }}>
                                    <Icons.Search />
                                    <input
                                        type="text"
                                        placeholder="Filter locations..."
                                        value={locationSearch}
                                        onChange={e => setLocationSearch(e.target.value)}
                                        style={{ ...styles.inputSmall, width: '100%', paddingLeft: '32px' }}
                                    />
                                    <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6e767d' }}><Icons.Search /></div>
                                    {locationSearch && (
                                        <button style={{ ...styles.iconButton, position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)' }} onClick={() => setLocationSearch('')}><Icons.X /></button>
                                    )}
                                </div>
                            </div>

                            {!isViewingHistory && <div style={styles.sidebarActions}>
                                <button style={{ ...styles.smallButton, flex: 1 }} onClick={() => setShowAddLocation(true)}><Icons.Plus /> Add Locations</button>
                                {selected && <button style={{ ...styles.smallButton, flex: 1, backgroundColor: '#1d3a5c', color: '#1d9bf0' }} onClick={() => setShowAddSublocation(true)}><Icons.Plus /> Add Sublocations</button>}
                            </div>}

                            {!isViewingHistory && multiSelectLocations.length > 0 && (
                                <div style={{ ...styles.sidebarActions, borderTop: 'none', paddingTop: 0, flexWrap: 'wrap', gap: '4px' }}>
                                    <button
                                        style={{ ...styles.smallButton, flex: '1 1 auto', backgroundColor: '#1a2a3d', color: '#1d9bf0', fontSize: '11px' }}
                                        onClick={() => setMoveModalLocations([...multiSelectLocations])}>
                                        <Icons.Location /> Move to... ({multiSelectLocations.length})
                                    </button>
                                    <button
                                        style={{ ...styles.smallButton, flex: '1 1 100%', backgroundColor: '#3d1a1a', color: '#f87171' }}
                                        onClick={() => { setDeleteTargets(multiSelectLocations); setShowDelete(true); }}>
                                        <Icons.Trash /> Delete Selected ({multiSelectLocations.length})
                                    </button>
                                    <button
                                        style={{ ...styles.smallButton, backgroundColor: '#2f3336' }}
                                        onClick={() => setMultiSelectLocations([])}>
                                        <Icons.X />
                                    </button>
                                </div>
                            )}

                            {!isViewingHistory && selected && (
                                <div style={{ ...styles.sidebarActions, borderTop: 'none', paddingTop: 0 }}>
                                    <button style={{ ...styles.smallButton, flex: 1, backgroundColor: '#3d2e1a', color: '#ffad1f' }} onClick={() => setShowDuplicate(true)}><Icons.Duplicate /> Duplicate Location</button>
                                </div>
                            )}

                            {multiSelectLocations.length === 0 && effectiveLocations.length > 0 && (
                                <div style={{ padding: '4px 16px 8px', fontSize: '11px', color: '#6e767d' }}>
                                    💡 Ctrl+Click to multi-select, Shift+Click to select range
                                </div>
                            )}

                            <div style={styles.sidebarContent}>
                                {effectiveLocations.length > 0 ? (
                                    <LocationTree
                                        locations={effectiveLocations}
                                        selectedId={selected?.id} 
                                        onSelect={(loc) => { setMultiSelectLocations([]); setSelected(loc); lastMultiSelectLocRef.current = loc.id; }}
                                        onDelete={(loc) => { setDeleteTargets([loc]); setShowDelete(true); }}
                                        onRename={renameLocation}
                                        onDuplicate={(loc) => { setDuplicateTarget(loc); setShowDuplicate(true); }}
                                        onMoveUp={moveLocationUp}
                                        onMoveDown={moveLocationDown}
                                        onPromote={promoteLocation}
                                        onDemote={demoteLocation}
                                        onMoveTo={(loc) => setMoveModalLocations([loc])}
                                        multiSelect={multiSelectLocations}
                                        onMultiSelectToggle={(loc, e) => {
                                            if (e?.shiftKey && lastMultiSelectLocRef.current) {
                                                // Shift+click: select range from anchor (don't move anchor)
                                                const idxA = flatVisibleLocations.findIndex(l => l.id === lastMultiSelectLocRef.current);
                                                const idxB = flatVisibleLocations.findIndex(l => l.id === loc.id);
                                                if (idxA !== -1 && idxB !== -1) {
                                                    const start = Math.min(idxA, idxB);
                                                    const end = Math.max(idxA, idxB);
                                                    const range = flatVisibleLocations.slice(start, end + 1);
                                                    setMultiSelectLocations(range);
                                                }
                                                // Don't update anchor — shift-click extends from the original anchor
                                            } else {
                                                // Ctrl+click: toggle individual
                                                setMultiSelectLocations(prev =>
                                                    prev.some(l => l.id === loc.id)
                                                        ? prev.filter(l => l.id !== loc.id)
                                                        : [...prev, loc]
                                                );
                                                lastMultiSelectLocRef.current = loc.id;
                                            }
                                        }}
                                        searchTerm={locationSearch}
                                        expandedState={expandedLocations}
                                        onToggleExpand={toggleExpand}
                                        catalogPkgs={packages}
                                        projectPkgs={effectivePackages}
                                    />
                                ) : (
                                    <div style={{ padding: '30px 20px', textAlign: 'center', color: '#6e767d', fontSize: '14px' }}>No locations yet.<br />Click "Add Locations" above.</div>
                                )}
                            </div>
                            {/* Sidebar resize handle */}
                            <div
                                onMouseDown={startSidebarResize}
                                style={{
                                    position: 'absolute', right: 0, top: 0, bottom: 0, width: '4px',
                                    cursor: 'col-resize', backgroundColor: 'transparent', zIndex: 10,
                                    transition: 'background-color 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1d9bf0'}
                                onMouseLeave={e => { if (!sidebarResizing.current) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            />
                        </aside>

                        <section style={styles.content}>
                            {/* View mode toggle */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '4px', alignItems: 'center' }}>
                                <div style={{ position: 'relative', marginRight: '8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Filter items..."
                                        value={workspaceSearch}
                                        onChange={e => setWorkspaceSearch(e.target.value)}
                                        style={{ ...styles.inputSmall, width: '200px', paddingRight: workspaceSearch ? '28px' : '8px', backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', color: '#e6edf3', fontSize: '13px', padding: '6px 10px' }}
                                    />
                                    {workspaceSearch && (
                                        <button
                                            onClick={() => setWorkspaceSearch('')}
                                            style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8b98a5', cursor: 'pointer', fontSize: '14px', padding: '2px 4px', lineHeight: 1 }}
                                            title="Clear filter"
                                        >✕</button>
                                    )}
                                </div>
                                <button
                                    style={{ 
                                        ...styles.smallButton, 
                                        backgroundColor: viewMode === 'single' ? '#1d9bf0' : 'transparent',
                                        color: viewMode === 'single' ? '#fff' : '#8b98a5',
                                        border: '1px solid #30363d'
                                    }} 
                                    onClick={() => setViewMode('single')}
                                    title="Single location view"
                                >
                                    <Icons.ViewSingle /> Single
                                </button>
                                <button 
                                    style={{ 
                                        ...styles.smallButton, 
                                        backgroundColor: viewMode === 'all' ? '#1d9bf0' : 'transparent',
                                        color: viewMode === 'all' ? '#fff' : '#8b98a5',
                                        border: '1px solid #30363d'
                                    }} 
                                    onClick={() => setViewMode('all')}
                                    title="All locations view"
                                >
                                    <Icons.ViewAll /> All
                                </button>
                                <button
                                    style={{
                                        ...styles.smallButton,
                                        backgroundColor: viewMode === 'unfinished' ? '#f59e0b' : 'transparent',
                                        color: viewMode === 'unfinished' ? '#000' : '#8b98a5',
                                        border: '1px solid #30363d'
                                    }}
                                    onClick={() => setViewMode('unfinished')}
                                    title="Unfinished placeholder items"
                                >
                                    <Icons.AlertTriangle /> Unfinished {placeholderCount > 0 && <span style={{ ...styles.badge('orange'), marginLeft: '4px', fontSize: '10px' }}>{placeholderCount}</span>}
                                </button>
                            </div>

                            {viewMode === 'single' ? (
                                selected ? (
                                    <LocationView
                                        location={selected}
                                        depth={selectedDepth}
                                        locationPath={getLocationPath(effectiveLocations, selected.id)}
                                        onUpdate={updateItems}
                                        onSearch={() => setShowSearch(true)}
                                        clipboard={clipboard}
                                        onCopy={handleCopy}
                                        onPaste={handlePaste}
                                        onSavePackage={handleSavePackage}
                                        onSaveTemplate={handleSaveTemplate}
                                        onApplyTemplate={() => setShowApplyTemplate(true)}
                                        templates={templates}
                                        catalog={catalog}
                                        onAddAccessoryToItem={handleAddAccessoryToItem}
                                        onConvertToAccessory={handleConvertToAccessory}
                                        onUngroupPackage={handleUngroupPackage}
                                        onMoveToPackage={handleMoveToPackage}
                                        compactMode={compactMode}
                                        onAddToCatalog={handleAddToCatalog}
                                        onUpdateFromCatalog={handleUpdateFromCatalog}
                                        catalogPkgs={packages}
                                        projectPkgs={effectivePackages}
                                        onReplaceItem={(itemIdx) => handleReplaceItem(itemIdx)}
                                        onReplacePackage={(packageName, itemIdx) => handleReplacePackage(packageName, itemIdx)}
                                        searchFilter={workspaceSearch}
                                        onEditPackage={(pkgId) => { setTab('packages'); setEditPackageId(pkgId); }}
                                    />
                                ) : (
                                    <div style={styles.emptyState}>
                                        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏢</div>
                                        <h3 style={{ color: '#8b98a5', fontSize: '20px' }}>Welcome to AV Estimator</h3>
                                        <p style={{ margin: '0 0 24px 0', maxWidth: '400px' }}>Start by creating your project structure. Add locations like buildings, levels, or areas.</p>
                                        {!isViewingHistory && <button style={styles.button('primary')} onClick={() => setShowAddLocation(true)}><Icons.Plus /> Add Locations</button>}
                                    </div>
                                )
                            ) : (
                                <AllLocationsView
                                    locations={effectiveLocations}
                                    onUpdate={(locationId, updater) => {
                                        const loc = findLocation(project.locations, locationId);
                                        if (loc) {
                                            const newItems = typeof updater === 'function' ? updater(loc.items || []) : updater;
                                            updateItems(locationId, newItems);
                                        }
                                    }}
                                    onSearch={(locationId) => {
                                        if (locationId) {
                                            setSearchTargetLocation(locationId);
                                        }
                                        setShowSearch(true);
                                    }}
                                    clipboard={clipboard}
                                    onCopy={handleCopy}
                                    onPaste={handlePaste}
                                    onSavePackage={(items, indices, locationId) => {
                                        setPendingPackageItems(items);
                                        setPendingPackageIndices(indices || []);
                                        setPendingPackageLocationId(locationId);
                                        setShowSavePackage(true);
                                    }}
                                    catalog={catalog}
                                    onAddAccessoryToItem={handleAddAccessoryToItem}
                                    onConvertToAccessory={handleConvertToAccessory}
                                    onUngroupPackage={handleUngroupPackage}
                                    onMoveToPackage={(locationId, itemIdx, packageName) => {
                                        const loc = findLocation(project.locations, locationId);
                                        if (!loc) return;
                                        const items = [...loc.items];
                                        items[itemIdx] = { ...items[itemIdx], packageName };
                                        updateItems(locationId, items);
                                        showToast(`Moved to ${packageName}`);
                                    }}
                                    expandedLocations={expandedWorkspaceLocations}
                                    onToggleLocationExpand={(locId) => setExpandedWorkspaceLocations(prev => ({ ...prev, [locId]: prev[locId] === false ? true : false }))}
                                    onExpandAllLocations={() => {
                                        const all = {};
                                        getAllLocationsFlatted(effectiveLocations).forEach(loc => all[loc.id] = true);
                                        setExpandedWorkspaceLocations(all);
                                    }}
                                    onCollapseAllLocations={() => {
                                        const all = {};
                                        getAllLocationsFlatted(effectiveLocations).forEach(loc => all[loc.id] = false);
                                        setExpandedWorkspaceLocations(all);
                                    }}
                                    compactMode={compactMode}
                                    onAddToCatalog={handleAddToCatalog}
                                    onUpdateFromCatalog={handleUpdateFromCatalog}
                                    catalogPkgs={packages}
                                    projectPkgs={effectivePackages}
                                    filterMode={viewMode === 'unfinished' ? 'unfinished' : undefined}
                                    onReplaceItem={(itemIdx, locationId) => handleReplaceItem(itemIdx, locationId)}
                                    onReplacePackage={(packageName, itemIdx, locationId) => handleReplacePackage(packageName, itemIdx, locationId)}
                                    searchFilter={workspaceSearch}
                                    onEditPackage={(pkgId) => { setTab('packages'); setEditPackageId(pkgId); }}
                                />
                            )}
                        </section>
                    </>
                )}

                {tab === 'catalog' && (
                    <section style={{
                        ...styles.content,
                        marginLeft: 0,
                        ...(projectCatalogTab === 'components' ? { display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}),
                    }}>
                        <nav style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexShrink: 0 }}>
                            <button style={styles.navButton(projectCatalogTab === 'components')} onClick={() => setProjectCatalogTab('components')}>Components</button>
                            <button style={styles.navButton(projectCatalogTab === 'packages')} onClick={() => setProjectCatalogTab('packages')}>Packages ({packages.length + (effectivePackages || []).length})</button>
                        </nav>
                        {projectCatalogTab === 'components' && (
                            renderCatalogPanel()
                        )}
                        {projectCatalogTab === 'packages' && (
                            <PackagesView
                                catalogPackages={packages}
                                projectPackages={effectivePackages || []}
                                onUpdateCatalogPackages={setPackages}
                                onUpdateProjectPackages={setProjectDirect}
                                catalog={catalog}
                                locations={effectiveLocations || []}
                                compactMode={compactMode}
                            />
                        )}
                    </section>
                )}
                {tab === 'packages' && <section style={{ ...styles.content, marginLeft: 0 }}><PackagesView catalogPackages={packages} projectPackages={effectivePackages || []} onUpdateCatalogPackages={setPackages} onUpdateProjectPackages={setProjectDirect} catalog={catalog} locations={effectiveLocations || []} compactMode={compactMode} initialSelectedPkgId={editPackageId} onInitialPkgConsumed={() => setEditPackageId(null)} /></section>}
                {tab === 'reports' && (
                    <section style={{ ...styles.content, marginLeft: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px' }}><Icons.Download /> Reports & Exports</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '12px', color: '#8b98a5', whiteSpace: 'nowrap' }}>Report Grouping:</label>
                                <select
                                    value={reportHierarchyDepth}
                                    onChange={e => setReportHierarchyDepth(parseInt(e.target.value))}
                                    style={{ ...styles.input, width: 'auto', minWidth: '180px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}
                                >
                                    {getHierarchyLevels(effectiveLocations).map(level => (
                                        <option key={level.depth} value={level.depth}>{level.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', marginBottom: '24px' }}>
                            {/* Export to Esticom */}
                            <div style={styles.card}>
                                <div style={styles.cardTitle}>Export to Esticom</div>
                                <p style={{ color: '#8b98a5', fontSize: '14px', margin: '0 0 16px 0' }}>Export BOM files grouped by {reportHierarchyDepth === -1 ? 'leaf location' : 'hierarchy level'}.</p>
                                <button style={styles.button('primary')} onClick={exportToEsticom}><Icons.Download /> Export</button>
                            </div>
                            {/* Consolidated BOM Export */}
                            <div style={styles.card}>
                                <div style={styles.cardTitle}>Consolidated BOM</div>
                                <p style={{ color: '#8b98a5', fontSize: '14px', margin: '0 0 16px 0' }}>Single BOM with all components across locations.</p>
                                <button style={styles.button('primary')} onClick={exportConsolidatedBOM}><Icons.Download /> Export</button>
                            </div>
                            {/* Technician BOM */}
                            <div style={styles.card}>
                                <div style={styles.cardTitle}>Technician BOM</div>
                                <p style={{ color: '#8b98a5', fontSize: '14px', margin: '0 0 16px 0' }}>PDF item list for field techs. One page per {reportHierarchyDepth === -1 ? 'location' : 'group'}.</p>
                                <button style={styles.button('primary')} onClick={exportTechnicianBOM}><Icons.Download /> Export PDF</button>
                            </div>
                            {/* Export to Procore Estimating */}
                            <div style={styles.card}>
                                <div style={styles.cardTitle}>Procore Estimating Import</div>
                                <p style={{ color: '#8b98a5', fontSize: '14px', margin: '0 0 16px 0' }}>Complete estimate with location sheets, labor, and phase codes.</p>
                                <button style={styles.button('primary')} onClick={exportProcoreEstimate}><Icons.Download /> Export</button>
                            </div>
                        </div>

                        {/* Editable Consolidated BOM Table */}
                        {(() => {
                            const bomItemsRaw = getConsolidatedBOM();
                            if (bomItemsRaw.length === 0) return <p style={{ color: '#8b98a5' }}>No components in project. Add items to locations to see the consolidated BOM.</p>;

                            // Collect unique categories for filter
                            const bomCategories = [...new Set(bomItemsRaw.map(b => b.category).filter(Boolean))].sort();

                            // Apply search + category filter
                            let bomItems = bomItemsRaw;
                            if (bomSearch.length >= 2) {
                                const term = bomSearch.toLowerCase();
                                bomItems = bomItems.filter(b =>
                                    (b.manufacturer || '').toLowerCase().includes(term) ||
                                    (b.model || '').toLowerCase().includes(term) ||
                                    (b.partNumber || '').toLowerCase().includes(term) ||
                                    (b.description || '').toLowerCase().includes(term)
                                );
                            }
                            if (bomCategoryFilter) {
                                bomItems = bomItems.filter(b => b.category === bomCategoryFilter);
                            }

                            // Apply sorting
                            if (bomSortField) {
                                bomItems = [...bomItems].sort((a, b) => {
                                    let aVal, bVal;
                                    if (bomSortField === 'qty') { aVal = a.totalQty; bVal = b.totalQty; }
                                    else if (bomSortField === 'extCost') { aVal = a.totalQty * a.unitCost; bVal = b.totalQty * b.unitCost; }
                                    else if (bomSortField === 'extLabor') { aVal = a.totalQty * a.laborHrsPerUnit; bVal = b.totalQty * b.laborHrsPerUnit; }
                                    else { aVal = a[bomSortField]; bVal = b[bomSortField]; }
                                    if (aVal == null) aVal = '';
                                    if (bVal == null) bVal = '';
                                    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                                    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                                    if (aVal < bVal) return bomSortDir === 'asc' ? -1 : 1;
                                    if (aVal > bVal) return bomSortDir === 'asc' ? 1 : -1;
                                    return 0;
                                });
                            }

                            let totalCost = 0, totalLabor = 0;
                            bomItems.forEach(b => { totalCost += b.totalQty * b.unitCost; totalLabor += b.totalQty * b.laborHrsPerUnit; });

                            const bomTdStyle = { ...styles.td, ...(compactMode ? { padding: '4px 8px', fontSize: '11px' } : {}) };
                            const bomThStyle = { ...styles.th, ...styles.thResizable, ...(compactMode ? { padding: '6px 8px', fontSize: '10px' } : {}) };
                            const bomInputStyle = compactMode ? { ...styles.input, width: '70px', padding: '2px 6px', fontSize: '11px', textAlign: 'right' } : { ...styles.input, width: '80px', padding: '4px 6px', fontSize: '12px', textAlign: 'right' };

                            const handleBomSort = (field) => {
                                if (bomSortField === field) { setBomSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
                                else { setBomSortField(field); setBomSortDir('asc'); }
                            };
                            const BomSortIcon = ({ field }) => {
                                if (bomSortField !== field) return null;
                                return bomSortDir === 'asc' ? <Icons.ChevronUp /> : <Icons.ChevronDown />;
                            };

                            return (
                                <div>
                                    {/* Header with collapse toggle */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showBom ? '12px' : '0' }}>
                                        <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setShowBom(v => !v)}>
                                            <span style={{ display: 'flex', transition: 'transform 0.15s' }}>{showBom ? <Icons.ChevronDown /> : <Icons.ChevronRight />}</span>
                                            Consolidated BOM
                                            <span style={{ fontSize: '13px', color: '#8b98a5', fontWeight: '400' }}>({fmtQty(bomItemsRaw.length)} unique items — {fmtCost(totalCost)} — {fmtHrs(totalLabor)})</span>
                                        </h3>
                                        {showBom && (
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            </div>
                                        )}
                                    </div>

                                    {showBom && (
                                        <>
                                            <p style={{ color: '#8b98a5', fontSize: '13px', margin: '0 0 12px 0' }}>Click any Unit Cost or Unit Labor value to edit it. Set Phase to assign it to all matching items across all locations at once.</p>
                                            {/* Search + Category filter */}
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                                                <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="Search BOM..."
                                                        value={bomSearch}
                                                        onChange={e => setBomSearch(e.target.value)}
                                                        style={{ ...styles.inputSmall, width: '100%', paddingLeft: '32px' }}
                                                    />
                                                    <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6e767d' }}><Icons.Search /></div>
                                                    {bomSearch && <button style={{ ...styles.iconButton, position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)' }} onClick={() => setBomSearch('')}><Icons.X /></button>}
                                                </div>
                                                {bomCategories.length > 0 && (
                                                    <select value={bomCategoryFilter} onChange={e => setBomCategoryFilter(e.target.value)} style={{ ...styles.inputSmall, width: 'auto', cursor: 'pointer' }}>
                                                        <option value="">All Categories</option>
                                                        {bomCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                )}
                                                {(bomSearch || bomCategoryFilter) && (
                                                    <span style={{ fontSize: '12px', color: '#8b98a5' }}>{bomItems.length} of {bomItemsRaw.length} items</span>
                                                )}
                                            </div>
                                            <div style={{ overflowX: 'auto', border: '1px solid #2f3336', borderRadius: '8px' }}>
                                                <table style={{ ...styles.table, fontSize: compactMode ? '11px' : '13px' }}>
                                                    <colgroup>
                                                        {bomCols.map(col => <col key={col.id} style={{ width: col.width }} />)}
                                                    </colgroup>
                                                    <thead>
                                                        <tr style={{ background: '#161b22' }}>
                                                            {bomCols.map((col, colIndex) => (
                                                                <th key={col.id} style={{ ...bomThStyle, cursor: 'pointer' }} onClick={() => handleBomSort(col.id)}>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{col.label}<BomSortIcon field={col.id} /></span>
                                                                    <div
                                                                        style={styles.resizeHandle}
                                                                        onMouseDown={e => { e.stopPropagation(); startBomResize(colIndex, e); }}
                                                                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                                                    />
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {bomItems.map((b, idx) => (
                                                            <tr key={b.key} style={{ borderBottom: '1px solid #2f3336' }} title={b.locations.join(', ')}
                                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1e2d3d'}
                                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                                {bomCols.map(col => {
                                                                    switch (col.id) {
                                                                        case 'qty': return <td key={col.id} style={bomTdStyle}>{fmtQty(b.totalQty)}</td>;
                                                                        case 'manufacturer': return <td key={col.id} style={bomTdStyle}>{b.manufacturer}</td>;
                                                                        case 'model': return <td key={col.id} style={{ ...bomTdStyle, fontWeight: '600' }}>{b.model}</td>;
                                                                        case 'partNumber': return <td key={col.id} style={{ ...bomTdStyle, fontSize: compactMode ? '10px' : '12px', color: '#8b98a5' }}>{b.partNumber}</td>;
                                                                        case 'description': return <td key={col.id} style={bomTdStyle}>{b.description}</td>;
                                                                        case 'phase': return <td key={col.id} style={bomTdStyle}><select value={b.phase || ''} onChange={e => updateConsolidatedPhase(b.key, e.target.value)} style={{ ...styles.inputSmall, width: '100%', cursor: 'pointer', fontSize: compactMode ? '10px' : '11px' }}><option value="">—</option>{PHASE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></td>;
                                                                        case 'unitCost': return <td key={col.id} style={bomTdStyle}>{bomEditingCell === b.key + '|unitCost' ? <input type="text" inputMode="decimal" value={bomEditingValue} onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) updateConsolidatedField(b.key, 'unitCost', v); }} onBlur={() => setBomEditingCell(null)} onKeyDown={e => { if (e.key === 'Enter') setBomEditingCell(null); }} onFocus={e => e.target.select()} style={bomInputStyle} autoFocus /> : <span onClick={() => { setBomEditingCell(b.key + '|unitCost'); setBomEditingValue(String(b.unitCost || 0)); }} style={{ cursor: 'pointer', display: 'block', textAlign: 'right' }}>{fmtCost(b.unitCost)}</span>}</td>;
                                                                        case 'laborHrsPerUnit': return <td key={col.id} style={bomTdStyle}>{bomEditingCell === b.key + '|laborHrsPerUnit' ? <input type="text" inputMode="decimal" value={bomEditingValue} onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) updateConsolidatedField(b.key, 'laborHrsPerUnit', v); }} onBlur={() => setBomEditingCell(null)} onKeyDown={e => { if (e.key === 'Enter') setBomEditingCell(null); }} onFocus={e => e.target.select()} style={bomInputStyle} autoFocus /> : <span onClick={() => { setBomEditingCell(b.key + '|laborHrsPerUnit'); setBomEditingValue(String(b.laborHrsPerUnit || 0)); }} style={{ cursor: 'pointer', display: 'block', textAlign: 'right' }}>{fmtHrs(b.laborHrsPerUnit)}</span>}</td>;
                                                                        case 'extCost': return <td key={col.id} style={{ ...bomTdStyle, color: '#00ba7c', fontWeight: '600' }}>{fmtCost(b.totalQty * b.unitCost)}</td>;
                                                                        case 'extLabor': return <td key={col.id} style={bomTdStyle}>{fmtHrs(b.totalQty * b.laborHrsPerUnit)}</td>;
                                                                        default: return <td key={col.id} style={bomTdStyle}></td>;
                                                                    }
                                                                })}
                                                            </tr>
                                                        ))}
                                                        <tr style={{ background: '#161b22', fontWeight: '700' }}>
                                                            <td colSpan={bomCols.length - 2} style={{ ...bomTdStyle, textAlign: 'right' }}>TOTALS</td>
                                                            <td style={{ ...bomTdStyle, color: '#00ba7c' }}>{fmtCost(totalCost)}</td>
                                                            <td style={bomTdStyle}>{fmtHrs(totalLabor)}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Labor by Phase Report */}
                        <div style={{ marginTop: '24px' }}>
                            <LaborByPhaseReport
                                locations={effectiveLocations}
                                catalogPkgs={packages}
                                projectPkgs={effectivePackages || []}
                                hierarchyGroups={reportHierarchyDepth === -1 ? null : getGroupedByHierarchy(effectiveLocations, reportHierarchyDepth, packages, effectivePackages || [])}
                                compactMode={compactMode}
                            />
                        </div>
                    </section>
                )}
            </main>

            {showSearch && <SearchModal catalog={catalog} packages={packages} projectPackages={project.packages || []} onClose={() => { setShowSearch(false); setReplaceContext(null); }} onInsert={replaceContext ? (items) => handleReplaceSelect(items[0]) : checkDiscontinuedAndInsert} onInsertPkg={replaceContext?.isPackage ? (pkg) => handleReplaceSelect(pkg) : insertPkg} replaceMode={!!replaceContext} replaceIsPackage={replaceContext?.isPackage} readOnly={projectReadOnly || isViewingHistory} onReadOnlyBlock={() => isProjectEditable()} />}

            {addToCatalogContext && (
                <CatalogItemModal
                    item={addToCatalogContext.prefill}
                    onClose={() => setAddToCatalogContext(null)}
                    onSave={handleAddToCatalogSave}
                    categories={catalog}
                    catalog={catalog}
                    uomOptions={uomOptions}
                    onUpdateUomOptions={setUomOptions}
                />
            )}

            {/* Replace Confirmation Modal */}
            {showReplaceConfirm && (
                <div style={styles.modal} onClick={() => { setShowReplaceConfirm(null); setReplaceContext(null); }}>
                    <div style={{ ...styles.modalContent, width: '450px' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icons.Sync /> Replace {showReplaceConfirm.isPackage ? 'Package' : 'Item'}
                        </h2>
                        <p style={{ margin: '0 0 8px 0', color: '#8b98a5', fontSize: '13px' }}>
                            This {showReplaceConfirm.isPackage ? 'package' : 'item'} exists in <strong style={{ color: '#e7e9ea' }}>{showReplaceConfirm.count} locations</strong>.
                        </p>
                        <p style={{ margin: '0 0 20px 0', color: '#8b98a5', fontSize: '13px' }}>
                            Replace <strong style={{ color: '#e7e9ea' }}>{showReplaceConfirm.original.manufacturer || showReplaceConfirm.original.packageName} {showReplaceConfirm.original.model || ''}</strong> with <strong style={{ color: '#1d9bf0' }}>{showReplaceConfirm.replacement.manufacturer || showReplaceConfirm.replacement.packageName} {showReplaceConfirm.replacement.model || ''}</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button style={styles.button('muted')} onClick={() => { setShowReplaceConfirm(null); setReplaceContext(null); }}>Cancel</button>
                            <button style={styles.button('primary')} onClick={() => {
                                executeReplace(showReplaceConfirm.replacement, 'this', showReplaceConfirm.locationId, showReplaceConfirm.isPackage);
                                setShowReplaceConfirm(null);
                                setReplaceContext(null);
                            }}>This Instance Only</button>
                            <button style={{ ...styles.button('primary'), backgroundColor: '#00ba7c' }} onClick={() => {
                                executeReplace(showReplaceConfirm.replacement, 'all', showReplaceConfirm.locationId, showReplaceConfirm.isPackage);
                                setShowReplaceConfirm(null);
                                setReplaceContext(null);
                            }}>All Locations ({showReplaceConfirm.count})</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Discontinued Item Warning */}
            {discontinuedWarning && (
                <div style={styles.modal} onClick={() => setDiscontinuedWarning(null)}>
                    <div style={{ ...styles.modalContent, width: '500px' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '700', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icons.AlertTriangle /> Discontinued Item{discontinuedWarning.discontinued.length > 1 ? 's' : ''}
                        </h2>
                        <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '12px' }}>
                            The following item{discontinuedWarning.discontinued.length > 1 ? 's are' : ' is'} marked as discontinued:
                        </p>
                        {discontinuedWarning.discontinued.map(item => (
                            <div key={item.id} style={{ padding: '10px 12px', backgroundColor: '#1a1f26', borderRadius: '8px', border: '1px solid #f59e0b30', marginBottom: '8px' }}>
                                <div style={{ fontWeight: '600', marginBottom: '2px' }}>{item.manufacturer} <span style={{ color: '#1d9bf0' }}>{item.model}</span></div>
                                {item.catalogNote && (
                                    <div style={{ fontSize: '13px', color: '#f59e0b', marginTop: '4px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                        <span style={{ flexShrink: 0 }}>Note:</span>
                                        <span>{item.catalogNote}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px solid #2f3336', paddingTop: '16px' }}>
                            <button style={styles.button('secondary')} onClick={() => setDiscontinuedWarning(null)}>Cancel</button>
                            <button style={{ ...styles.button('primary'), backgroundColor: '#f59e0b', color: '#000' }} onClick={() => {
                                insertComps(discontinuedWarning.comps, discontinuedWarning.qty);
                                setDiscontinuedWarning(null);
                            }}>Add Anyway</button>
                        </div>
                    </div>
                </div>
            )}

            {showAddLocation && <AddLocationModal isTopLevel={true} onClose={() => setShowAddLocation(false)} onAdd={addLocations} />}
            {showAddSublocation && selected && <AddLocationModal parent={selected} isTopLevel={false} onClose={() => setShowAddSublocation(false)} onAdd={addLocations} />}
            {showDuplicate && (duplicateTarget || selected) && <DuplicateModal location={duplicateTarget || selected} onClose={() => { setShowDuplicate(false); setDuplicateTarget(null); }} onDuplicate={duplicateStructure} />}
            {showDelete && deleteTargets.length > 0 && <DeleteConfirmModal locations={deleteTargets} onClose={() => { setShowDelete(false); setDeleteTargets([]); setMultiSelectLocations([]); }} onDelete={deleteLocation} catalogPkgs={packages} projectPkgs={project.packages} />}
            {moveModalLocations && <MoveLocationModal locations={effectiveLocations} movingLocations={moveModalLocations} onMove={moveLocationTo} onClose={() => setMoveModalLocations(null)} />}

            {/* Revision Prompt Modal */}
            {showRevisionPrompt && (
                <RevisionPromptModal
                    project={pendingRevisionProjectId ? (projects.find(p => p.id === pendingRevisionProjectId) || project) : project}
                    onClose={() => { setShowRevisionPrompt(false); setPendingRevisionProjectId(null); setRevisionPromptManualCreate(false); }}
                    onCreateRevision={createRevision}
                    manualCreate={revisionPromptManualCreate}
                />
            )}

            {/* Revision History Panel */}
            {showRevisionHistory && (
                <RevisionHistoryPanel
                    project={project}
                    viewingRevisionId={viewingRevisionId}
                    onViewRevision={(revId) => { setViewingRevisionId(revId); if (revId) setShowRevisionHistory(false); }}
                    onRestoreRevision={(revId) => { restoreRevision(revId); setShowRevisionHistory(false); }}
                    onClose={() => setShowRevisionHistory(false)}
                />
            )}

            {/* Save Package Modal */}
            {showSavePackage && pendingPackageItems.length > 0 && (
                <div style={styles.modal} onClick={() => setShowSavePackage(false)}>
                    <div style={{ ...styles.modalContent, width: '500px' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}><Icons.Package /> Save as Package</h2>
                        <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '16px' }}>Save {pendingPackageItems.length} component{pendingPackageItems.length > 1 ? 's' : ''} as a reusable package.</p>
                        <form onSubmit={e => { e.preventDefault(); const name = e.target.elements.pkgName.value.trim(); const scope = e.target.elements.pkgScope.value; if (name) savePackage(name, scope); }}>
                            <input name="pkgName" type="text" placeholder="Package name (e.g., Small Huddle - Logitech)" style={styles.input} autoFocus />
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#8b98a5' }}>
                                    <input type="radio" name="pkgScope" value="catalog" defaultChecked style={{ accentColor: '#1d9bf0' }} />
                                    Catalog Package <span style={{ fontSize: '11px', color: '#6e767d' }}>(reusable across all projects)</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#8b98a5' }}>
                                    <input type="radio" name="pkgScope" value="project" style={{ accentColor: '#1d9bf0' }} />
                                    Project Package <span style={{ fontSize: '11px', color: '#6e767d' }}>(this project only)</span>
                                </label>
                            </div>
                            <div style={{ ...styles.preview, marginTop: '16px', maxHeight: '200px' }}>
                                {pendingPackageItems.map((item, i) => (
                                    <div key={i} style={{ ...styles.previewItem, justifyContent: 'space-between' }}>
                                        <span>{item.qty}x {item.manufacturer} {item.model}</span>
                                        <span style={{ color: '#00ba7c' }}>{fmtCost(item.qty * (item.unitCost || 0))}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                                <button type="button" style={styles.button('secondary')} onClick={() => setShowSavePackage(false)}>Cancel</button>
                                <button type="submit" style={styles.button('success')}><Icons.Package /> Save Package</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Save Template Modal */}
            {showSaveTemplate && selected && (
                <div style={styles.modal} onClick={() => setShowSaveTemplate(false)}>
                    <div style={{ ...styles.modalContent, width: '500px' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}><Icons.Template /> Save as Room Template</h2>
                        <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '16px' }}>Save this room's {selected.items?.length || 0} component{(selected.items?.length || 0) !== 1 ? 's' : ''} as a reusable template.</p>
                        <form onSubmit={e => { e.preventDefault(); const name = e.target.elements.tplName.value.trim(); if (name) saveTemplate(name); }}>
                            <input name="tplName" type="text" placeholder="Template name" defaultValue={selected.name + ' Template'} style={styles.input} autoFocus />
                            <div style={{ ...styles.preview, marginTop: '16px', maxHeight: '200px' }}>
                                {(selected.items || []).map((item, i) => (
                                    <div key={i} style={{ ...styles.previewItem, justifyContent: 'space-between' }}>
                                        <span>{item.qty}x {item.manufacturer} {item.model}</span>
                                        <span style={{ color: '#00ba7c' }}>{fmtCost(item.qty * (item.unitCost || 0))}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                                <button type="button" style={styles.button('secondary')} onClick={() => setShowSaveTemplate(false)}>Cancel</button>
                                <button type="submit" style={styles.button('purple')}><Icons.Template /> Save Template</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Apply Template Modal */}
            {showApplyTemplate && (
                <div style={styles.modal} onClick={() => setShowApplyTemplate(false)}>
                    <div style={{ ...styles.modalContent, width: '550px' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}><Icons.Template /> Apply Room Template</h2>
                        {templates.length > 0 ? (
                            <div style={styles.searchResults}>
                                {templates.map(tpl => {
                                    const cost = tpl.items.reduce((s, i) => s + (i.qty * (i.unitCost || 0)), 0);
                                    return (
                                        <div key={tpl.id} style={{ ...styles.searchItem(false), cursor: 'pointer' }} 
                                            onClick={() => { applyTemplate(tpl); setShowApplyTemplate(false); }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1a1f26'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <Icons.Template />
                                                    <span style={{ fontWeight: '600' }}>{tpl.name}</span>
                                                    <span style={styles.badge('purple')}>{tpl.items.length} items</span>
                                                </div>
                                                <span style={{ color: '#00ba7c', fontWeight: '600' }}>{fmtCost(cost)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#6e767d' }}>
                                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
                                <p>No room templates yet. Save a room as a template first.</p>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button style={styles.button('secondary')} onClick={() => setShowApplyTemplate(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Accessory Prompt Modal */}
            {accessoryPromptComponent && pendingComponents && (
                <AccessoryPromptModal
                    component={accessoryPromptComponent}
                    accessories={accessoryPromptComponent.defaultAccessories || []}
                    qty={pendingComponents.qty}
                    catalog={catalog}
                    onConfirm={handleAccessoryPromptConfirm}
                    onClose={handleAccessoryPromptCancel}
                />
            )}
            
            {/* Convert to Accessory Modal */}
            {showConvertToAccessory && convertItemIdx !== null && (() => {
                const targetLocation = convertLocationId ? findLocation(project.locations, convertLocationId) : selected;
                return targetLocation ? (
                    <ConvertToAccessoryModal
                        items={targetLocation.items}
                        itemIdx={convertItemIdx}
                        onConfirm={confirmConvertToAccessory}
                        onClose={() => { setShowConvertToAccessory(false); setConvertItemIdx(null); setConvertLocationId(null); }}
                    />
                ) : null;
            })()}
            
            {/* Add Accessory Modal */}
            {showAddAccessoryModal && addAccessoryItemIdx !== null && (() => {
                const targetLocation = addAccessoryLocationId ? findLocation(project.locations, addAccessoryLocationId) : selected;
                return targetLocation ? (
                    <AddAccessoryModal
                        item={targetLocation.items[addAccessoryItemIdx]}
                        catalog={catalog}
                        onConfirm={confirmAddAccessory}
                        onClose={() => { setShowAddAccessoryModal(false); setAddAccessoryItemIdx(null); setAddAccessoryLocationId(null); }}
                    />
                ) : null;
            })()}
            
            {/* Catalog Conflict Resolution Modal */}
            {catalogConflicts && (
                <CatalogConflictModal 
                    conflicts={catalogConflicts.conflicts}
                    onResolve={handleConflictResolution}
                    onClose={() => { setCatalogConflicts(null); setCatalogSyncStatus('offline'); }}
                />
            )}
            
            {/* Checkin Modal */}
            {showCheckinModal && (
                <CheckoutModal
                    mode="checkin"
                    projectName={project.name}
                    onCheckin={() => closeProjectDirect(true)}
                    onKeepCheckedOut={() => closeProjectDirect(false)}
                    onClose={() => setShowCheckinModal(false)}
                />
            )}

            {/* Toast Notification */}
            {toast && (() => {
                const isWarning = typeof toast === 'object' && toast.type === 'warning';
                const msg = typeof toast === 'object' ? toast.msg : toast;
                return (
                    <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '12px', backgroundColor: isWarning ? '#3d2e1a' : '#1a3d2e', border: `1px solid ${isWarning ? '#4a3520' : '#2d4a3e'}`, color: isWarning ? '#f59e0b' : '#00ba7c', fontSize: '14px', fontWeight: '500', zIndex: 2000 }}>
                        {msg}
                    </div>
                );
            })()}
        </div>
    );
}

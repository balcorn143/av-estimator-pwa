import React from 'react'
const { useState, useEffect, useCallback, useMemo, useRef } = React
import { CONFIG, supabase, getDataUrl, APP_VERSION } from './config'
import { styles } from './styles'
import { Icons } from './icons'
import { DEFAULT_CATALOG, UOM_OPTIONS, SYSTEM_OPTIONS, PHASE_OPTIONS, PROJECT_STATUSES, DEFAULT_COLUMNS, CATALOG_COLUMNS } from './constants'
import { fmtCost, fmtQty, fmtHrs, formatCurrency, formatHours } from './utils/formatters'
import { parseLocationInput, getLocationPath, getAllLocationsFlatted, getLocationsWithItems, getHierarchyLevels, getGroupedByHierarchy, cloneStructure, sortLocationsAlpha, filterLocations } from './utils/locations'
import { generateCatalogId, calculateTotals, itemMatchesSearch } from './utils/catalog'
import { generatePackageId, resolvePackageInstance, findAllPackageInstances, getFlattenedItems, migrateProjectPackages, migratePackageDefinitions } from './utils/packages'
import { generateEsticomWorkbook, generateProcoreEstimateWorkbook } from './utils/export'
import * as XLSX from 'xlsx'
import useFlexibleColumns from './hooks/useFlexibleColumns'
import ColumnLayoutManager from './components/ColumnLayoutManager'
import LocationTree from './components/LocationTree'
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
import AccessoryPromptModal from './components/AccessoryPromptModal'
import ConvertToAccessoryModal from './components/ConvertToAccessoryModal'
import AddAccessoryModal from './components/AddAccessoryModal'
import LoginScreen from './components/LoginScreen'
import CatalogView from './components/CatalogView'
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

    // Fetch team membership on login
    useEffect(() => {
        if (!supabase || !session) { setTeam(null); return; }
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
    const [team, setTeam] = useState(null);
    const [showTeamModal, setShowTeamModal] = useState(false);
    const hasLoaded = React.useRef(false);
    const [editingProject, setEditingProject] = useState(null);
    const [showProjectSettings, setShowProjectSettings] = useState(false);
    const [showRevisionPrompt, setShowRevisionPrompt] = useState(false);
    const [pendingMutation, setPendingMutation] = useState(null);
    const [viewingRevisionId, setViewingRevisionId] = useState(null);
    const [showRevisionHistory, setShowRevisionHistory] = useState(false);
    const [pendingRevisionProjectId, setPendingRevisionProjectId] = useState(null); // For revisions on non-active projects
    const [revisionPromptLabelOverride, setRevisionPromptLabelOverride] = useState(null);
    const [revisionPromptManualCreate, setRevisionPromptManualCreate] = useState(false);
    const [projectSearchTerm, setProjectSearchTerm] = useState('');
    const [projectFilter, setProjectFilter] = useState('active');
    
    // Current project state (when a project is open)
    const [tab, setTab] = useState('project');
    const [catalog, setCatalog] = useState([]);
    const [catalogSyncStatus, setCatalogSyncStatus] = useState('loading');
    const [catalogDirty, setCatalogDirty] = useState(false);
    const [catalogConflicts, setCatalogConflicts] = useState(null);
    const [packages, setPackages] = useState([]);
    
    // Load catalog on mount. If first-time (no localStorage) and team becomes available, reload to get Supabase customizations.
    const catalogInitializedRef = React.useRef(false);
    const catalogVersionRefreshed = React.useRef(false);
    useEffect(() => {
        loadCatalogData();
    }, []);
    useEffect(() => {
        // When team becomes available, reload catalog only if it hasn't been initialized from localStorage
        // (i.e., first-time setup where we need Supabase customizations)
        if (team && !catalogInitializedRef.current) {
            loadCatalogData();
        }
        loadPackagesData();
    }, [team]);
    
    // Helper to apply team customizations (edits, deletions, favorites, notes) to base catalog
    const applyCatalogCustomizations = (baseCatalog, customizations, { skipCategories = false } = {}) => {
        if (!customizations?.length) return baseCatalog;
        const customMap = {};
        customizations.forEach(c => { customMap[c.catalog_item_id] = c; });
        return baseCatalog.map(item => {
            const custom = customMap[item.id];
            if (custom) {
                let merged = { ...item, favorite: custom.favorite, catalogNote: custom.catalog_note, deleted: !!custom.deleted };
                if (custom.custom_fields) {
                    try {
                        const fields = typeof custom.custom_fields === 'string' ? JSON.parse(custom.custom_fields) : custom.custom_fields;
                        // When base catalog was refreshed (version bump), don't let stale Supabase
                        // category/subcategory overwrite the new base catalog values
                        if (skipCategories) {
                            delete fields.category;
                            delete fields.subcategory;
                        }
                        merged = { ...merged, ...fields };
                    } catch (e) { console.error('Failed to parse custom_fields', e); }
                }
                return merged;
            }
            return item;
        });
    };

    const loadCatalogData = async () => {
        // localStorage is the primary source of truth for the catalog.
        // On first ever load (no localStorage), build from av_catalog.json + Supabase.
        // On subsequent loads (browser refresh), just use localStorage directly.
        // Use the in-app refresh button to pull latest from Supabase.
        // If CATALOG_VERSION changes (av_catalog.json was updated), force re-fetch.
        const savedVersion = localStorage.getItem('av-estimator-catalog-version');
        const versionMatch = savedVersion && parseInt(savedVersion) === CONFIG.CATALOG_VERSION;
        const saved = localStorage.getItem('av-estimator-catalog');
        if (saved && versionMatch) {
            try {
                const localCatalog = JSON.parse(saved);
                if (localCatalog?.length > 0) {
                    setCatalog(localCatalog);
                    setCatalogSyncStatus(supabase && session ? 'synced' : 'local');
                    setCatalogDirty(false);
                    catalogInitializedRef.current = true;
                    return;
                }
            } catch (e) {}
        }
        if (!versionMatch) {
            console.log('Catalog version changed — re-fetching base catalog');
            catalogVersionRefreshed.current = true;
        }

        // First-time load: build catalog from base JSON + Supabase customizations
        setCatalogSyncStatus('syncing');
        let result = null;
        try {
            const response = await fetch(getDataUrl(CONFIG.CATALOG_FILE));
            if (response.ok) {
                result = await response.json();
            }
        } catch (e) {
            console.log('Failed to fetch base catalog');
        }

        if (!result) {
            result = DEFAULT_CATALOG;
            setCatalog(result);
            setCatalogSyncStatus('offline');
            setCatalogDirty(false);
            return;
        }

        // Apply team customizations from Supabase if available
        if (supabase && session && team) {
            try {
                const { data: customizations, error } = await supabase
                    .from('catalog_customizations')
                    .select('*')
                    .eq('team_id', team.id)
                    .limit(5000);
                if (!error && customizations?.length > 0) {
                    result = applyCatalogCustomizations(result, customizations, { skipCategories: !versionMatch });
                }
            } catch (e) {
                console.log('Failed to load team customizations');
            }
        }

        setCatalog(result);
        localStorage.setItem('av-estimator-catalog', JSON.stringify(result));
        localStorage.setItem('av-estimator-catalog-version', String(CONFIG.CATALOG_VERSION));
        setCatalogSyncStatus(supabase && session ? 'synced' : 'local');
        setCatalogDirty(false);
    };
    
    const loadPackagesData = async () => {
        try {
            const response = await fetch(getDataUrl(CONFIG.PACKAGES_FILE));
            if (response.ok) {
                const data = await response.json();
                setPackages(data);
                localStorage.setItem('av-estimator-packages', JSON.stringify(data));
                return;
            }
        } catch (e) {
            console.log('Failed to fetch remote packages, using local');
        }
        
        // Fall back to localStorage
        const saved = localStorage.getItem('av-estimator-packages');
        if (saved) {
            try {
                setPackages(JSON.parse(saved));
                return;
            } catch (e) {}
        }
        
        // Empty packages
        setPackages([]);
    };
    
    // Refresh catalog: pull coworker changes from Supabase and merge with local catalog.
    // localStorage/in-memory catalog is the base; Supabase customizations with newer timestamps win.
    const refreshCatalog = async () => {
        if (!supabase || !session || !team) {
            showToast('Catalog is up to date (local only)');
            return;
        }
        setCatalogSyncStatus('syncing');
        try {
            // Build a map of current local catalog for merging
            const localMap = {};
            catalog.forEach(c => { localMap[c.id] = c; });

            // Fetch team customizations from Supabase
            const { data: customizations, error } = await supabase
                .from('catalog_customizations')
                .select('*')
                .eq('team_id', team.id)
                .limit(5000);

            if (error) {
                console.error('Refresh error:', error);
                setCatalogSyncStatus('offline');
                showToast('Could not refresh catalog');
                return;
            }

            if (customizations?.length > 0) {
                // Apply Supabase customizations, but only if they're newer than local edits
                let updatedCount = 0;
                customizations.forEach(custom => {
                    const local = localMap[custom.catalog_item_id];
                    if (!local) return;
                    const localTime = local.modifiedAt ? new Date(local.modifiedAt).getTime() : 0;
                    const remoteTime = custom.updated_at ? new Date(custom.updated_at).getTime() : 0;
                    // Remote is newer — apply Supabase customization over local
                    if (remoteTime > localTime) {
                        let merged = { ...local, favorite: custom.favorite, catalogNote: custom.catalog_note, deleted: !!custom.deleted };
                        if (custom.custom_fields) {
                            try {
                                const fields = typeof custom.custom_fields === 'string' ? JSON.parse(custom.custom_fields) : custom.custom_fields;
                                merged = { ...merged, ...fields };
                            } catch (e) {}
                        }
                        // Preserve the remote timestamp as modifiedAt so future refreshes know
                        merged.modifiedAt = custom.updated_at;
                        localMap[custom.catalog_item_id] = merged;
                        updatedCount++;
                    }
                });
                if (updatedCount > 0) {
                    const updated = catalog.map(c => localMap[c.id] || c);
                    setCatalog(updated);
                    localStorage.setItem('av-estimator-catalog', JSON.stringify(updated));
                    showToast(`Catalog refreshed: ${updatedCount} item${updatedCount !== 1 ? 's' : ''} updated from team`);
                } else {
                    showToast('Catalog is up to date');
                }
            } else {
                showToast('Catalog is up to date');
            }
            setCatalogSyncStatus('synced');
            setCatalogDirty(false);
        } catch (e) {
            console.error('Refresh error:', e);
            setCatalogSyncStatus('offline');
            showToast('Could not refresh catalog');
        }
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
    const [showSearch, setShowSearch] = useState(false);
    const [searchTargetLocation, setSearchTargetLocation] = useState(null); // For all-locations mode
    const [replaceContext, setReplaceContext] = useState(null); // { itemIdx, locationId, item, isPackage, packageName }
    const [showReplaceConfirm, setShowReplaceConfirm] = useState(null); // { replacement, original, locationId, isPackage, count }
    const [showAddLocation, setShowAddLocation] = useState(false);
    const [showAddSublocation, setShowAddSublocation] = useState(false);
    const [showDuplicate, setShowDuplicate] = useState(false);
    const [duplicateTarget, setDuplicateTarget] = useState(null); // Location to duplicate (null = use selected)
    const [showDelete, setShowDelete] = useState(false);
    const [clipboard, setClipboard] = useState([]);
    const [locationSearch, setLocationSearch] = useState('');
    const [expandedLocations, setExpandedLocations] = useState({});
    const [expandedWorkspaceLocations, setExpandedWorkspaceLocations] = useState({}); // For all-locations view
    const [templates, setTemplates] = useState([]);
    const [multiSelectLocations, setMultiSelectLocations] = useState([]);
    const lastMultiSelectLocRef = useRef(null);
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
        { id: 'unitCost', label: 'Unit Cost', width: 90 },
        { id: 'laborHrsPerUnit', label: 'Unit Labor', width: 90 },
        { id: 'extCost', label: 'Ext. Cost', width: 90 },
        { id: 'extLabor', label: 'Ext. Labor', width: 90 },
    ]);

    // Report state
    const [showLaborByPhase, setShowLaborByPhase] = useState(true);
    const [reportHierarchyDepth, setReportHierarchyDepth] = useState(-1);

    // History for undo/redo
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const isUndoRedo = React.useRef(false);

    // Update project helper
    // Check if a mutation requires a revision before proceeding
    const requiresRevision = (proj) => {
        const postSubmissionStatuses = ['proposal-submitted', 'active', 'completed'];
        return postSubmissionStatuses.includes(proj?.status) && !proj?.currentRevision;
    };

    const setProjectDirect = (updater) => {
        setProjects(prev => prev.map(p => {
            if (p.id === activeProjectId) {
                const newProject = typeof updater === 'function' ? updater(p) : updater;
                return { ...newProject, updatedAt: new Date().toISOString(), updatedBy: session?.user?.email || '' };
            }
            return p;
        }));
    };

    const setProject = (updater) => {
        if (projectReadOnly) {
            showToast('Project is read-only — checked out by ' + (checkedOutBy || 'another user'));
            return;
        }
        if (isViewingHistory) {
            showToast('Cannot edit — viewing a historical revision');
            return;
        }
        const currentProject = projects.find(p => p.id === activeProjectId);
        if (currentProject && requiresRevision(currentProject)) {
            setPendingMutation(() => () => setProjectDirect(updater));
            setShowRevisionPrompt(true);
            return;
        }
        setProjectDirect(updater);
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
        // Add the revision to the project and set it as current
        if (targetProjectId === activeProjectId) {
            setProjectDirect(p => ({
                ...p,
                revisions: [...(p.revisions || []), revision],
                currentRevision: revision.id,
            }));
        } else {
            // Non-active project (e.g., status change from dashboard)
            setProjects(prev => prev.map(p =>
                p.id === targetProjectId ? {
                    ...p,
                    revisions: [...(p.revisions || []), revision],
                    currentRevision: revision.id,
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

        // Then execute the pending mutation
        if (pendingMutation) {
            setTimeout(() => {
                pendingMutation();
                setPendingMutation(null);
            }, 50);
        }
    };

    // Close current revision (next change will prompt for new one)
    const closeRevision = () => {
        setProjectDirect(p => ({ ...p, currentRevision: null }));
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
            currentRevision: null,
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
            currentRevision: null,
            packages: [],
        };
        setProjects(prev => [newProject, ...prev]);
        return newProject.id;
    };
    
    // Open a project
    const [projectReadOnly, setProjectReadOnly] = useState(false);
    const [checkedOutBy, setCheckedOutBy] = useState(null);
    const [checkouts, setCheckouts] = useState({}); // { projectId: { email, userId } }

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

    const openProject = async (projectId) => {
        setProjectReadOnly(false);
        setCheckedOutBy(null);

        // Attempt checkout if on a team
        if (supabase && session && team) {
            try {
                const { data: success } = await supabase.rpc('checkout_project', {
                    p_project_id: projectId,
                    p_email: session.user.email
                });
                if (success === false) {
                    // Someone else has it checked out — open read-only
                    const { data: projRow } = await supabase
                        .from('projects')
                        .select('checked_out_email, checked_out_by')
                        .eq('id', projectId)
                        .single();
                    setProjectReadOnly(true);
                    setCheckedOutBy(projRow?.checked_out_email || 'another user');
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

    // Close current project and return to home
    const closeProject = async () => {
        // Check in the project
        if (supabase && session && activeProjectId && !projectReadOnly) {
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
            closeProject();
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
        const proj = projects.find(p => p.id === projectId);
        // When first submitting a proposal, prompt for a baseline revision snapshot
        if (proj && proj.status === 'developing' && newStatus === 'proposal-submitted' && (!proj.revisions || proj.revisions.length === 0)) {
            setPendingRevisionProjectId(projectId);
            setPendingMutation(() => () => {
                setProjects(prev => prev.map(p =>
                    p.id === projectId ? { ...p, status: newStatus, updatedAt: new Date().toISOString(), updatedBy: session?.user?.email || '' } : p
                ));
            });
            setShowRevisionPrompt(true);
            return;
        }
        setProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, status: newStatus, updatedAt: new Date().toISOString(), updatedBy: session?.user?.email || '' } : p
        ));
    };

    // Create revision from dashboard context menu
    const handleDashboardCreateRevision = (proj) => {
        const hasRevisions = proj.revisions && proj.revisions.length > 0;
        if (!hasRevisions) {
            // No revisions yet — silently create "Original" snapshot first
            const originalSnapshot = {
                locations: JSON.parse(JSON.stringify(proj.locations || [])),
                packages: JSON.parse(JSON.stringify(proj.packages || [])),
            };
            const originalRevision = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                label: 'Original',
                notes: 'Original project state before revisions',
                createdAt: new Date().toISOString(),
                createdBy: session?.user?.email || 'unknown',
                snapshot: originalSnapshot,
            };
            // Save Original revision to the project
            if (proj.id === activeProjectId) {
                setProjectDirect(p => ({
                    ...p,
                    revisions: [...(p.revisions || []), originalRevision],
                    currentRevision: originalRevision.id,
                }));
            } else {
                setProjects(prev => prev.map(p =>
                    p.id === proj.id ? {
                        ...p,
                        revisions: [...(p.revisions || []), originalRevision],
                        currentRevision: originalRevision.id,
                        updatedAt: new Date().toISOString(),
                        updatedBy: session?.user?.email || '',
                    } : p
                ));
            }
            showToast('Saved "Original" snapshot');
        }
        // Now prompt for the new revision label
        setPendingRevisionProjectId(proj.id);
        setPendingMutation(null); // No pending mutation — just creating a revision
        setRevisionPromptLabelOverride(!hasRevisions ? 'Rev 1' : null);
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

    // Wrapper to update catalog + sync full catalog to Supabase for teams
    const catalogSyncTimer = React.useRef(null);
    const updateCatalog = (newCatalog) => {
        const updated = typeof newCatalog === 'function' ? newCatalog(catalog) : newCatalog;
        setCatalog(updated);
        setCatalogDirty(true);
        // Immediately save to localStorage so a page refresh won't lose changes
        localStorage.setItem('av-estimator-catalog', JSON.stringify(updated));
    };

    const saveCatalog = async () => {
        // Save to localStorage immediately
        localStorage.setItem('av-estimator-catalog', JSON.stringify(catalog));

        // Sync to Supabase if on a team
        if (supabase && session && team) {
            setCatalogSyncStatus('syncing');
            try {
                const modified = catalog.filter(c => c.modifiedAt || c.favorite || c.catalogNote || c.deleted);
                if (modified.length > 0) {
                    const customizations = modified.map(c => ({
                        team_id: team.id,
                        catalog_item_id: c.id,
                        favorite: !!c.favorite,
                        catalog_note: c.catalogNote || '',
                        deleted: !!c.deleted,
                        custom_fields: JSON.stringify({
                            manufacturer: c.manufacturer,
                            model: c.model,
                            partNumber: c.partNumber,
                            description: c.description,
                            category: c.category,
                            subcategory: c.subcategory,
                            unitCost: c.unitCost,
                            laborHrsPerUnit: c.laborHrsPerUnit,
                            uom: c.uom,
                            vendor: c.vendor,
                            phase: c.phase || '',
                            discontinued: !!c.discontinued,
                        }),
                        updated_at: new Date().toISOString(),
                    }));
                    const { error: upsertError } = await supabase.from('catalog_customizations').upsert(customizations, { onConflict: 'team_id,catalog_item_id' });
                    if (upsertError) {
                        console.error('Catalog upsert error:', upsertError);
                    }
                }
                // Don't reload from Supabase after save — our in-memory catalog is the source of truth.
                // Reloading was causing deleted items to repopulate when the Supabase columns
                // weren't set up or the round-trip hadn't completed yet.
                // Coworkers will get updates when they open/refresh the catalog via loadCatalogData.
                setCatalogSyncStatus('synced');
            } catch (e) {
                console.error('Catalog sync error:', e);
                setCatalogSyncStatus('offline');
            }
        }
        setCatalogDirty(false);
        showToast('Catalog saved');
    };

    // Auto-save to localStorage + Supabase sync (skip until initial load completes)
    useEffect(() => {
        if (!hasLoaded.current) return;
        const data = { projects, packages, templates, activeProjectId };
        localStorage.setItem('av-estimator-data-v2', JSON.stringify(data));

        // Debounced sync to Supabase
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
                    // Sync packages/templates
                    await supabase.from('user_settings').upsert({
                        user_id: session.user.id,
                        team_id: team?.id || null,
                        packages,
                        templates,
                        updated_at: new Date().toISOString(),
                    });
                    setSyncStatus('synced');
                } catch (err) {
                    console.error('Sync error:', err);
                    setSyncStatus('error');
                }
            }, 2000);
        }
    }, [projects, packages, templates, activeProjectId, team]);

    // Manual save — flush localStorage + immediate Supabase sync (Ctrl+S / Save button)
    const saveNow = React.useCallback(async () => {
        if (!hasLoaded.current) return;
        // 1. Save to localStorage immediately
        const data = { projects, packages, templates, activeProjectId };
        localStorage.setItem('av-estimator-data-v2', JSON.stringify(data));

        // 2. Cancel any pending debounced sync
        clearTimeout(syncTimer.current);

        // 3. Immediate Supabase sync
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
                    updated_at: new Date().toISOString(),
                });
                setSyncStatus('synced');
                showToast('Project saved ✓');
            } catch (err) {
                console.error('Save error:', err);
                setSyncStatus('error');
                showToast('Saved locally (sync failed)');
            }
        } else {
            showToast('Project saved locally');
        }
    }, [projects, packages, templates, activeProjectId, team, supabase, session]);

    // Save catalog to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('av-estimator-catalog', JSON.stringify(catalog));
    }, [catalog]);
    
    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('av-estimator-data-v2');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                // Migrate old statuses to new ones
                const statusMap = { bidding: 'developing', won: 'active', 'in-progress': 'active' };
                const migratedProjects = (data.projects || []).map(p =>
                    statusMap[p.status] ? { ...p, status: statusMap[p.status] } : p
                );
                if (migratedProjects.length > 0) {
                    setProjects(migratedProjects);
                }
                if (data.activeProjectId) {
                    setActiveProjectId(data.activeProjectId);
                    setShowProjectsHome(false);
                }
                // Migrate package definitions to new format
                let loadedPackages = data.packages?.length > 0 ? migratePackageDefinitions(data.packages) : [];
                if (loadedPackages.length > 0) setPackages(loadedPackages);

                // Migrate old packageName items to package instances
                let allNewDefs = [];
                const pkgMigratedProjects = migratedProjects.map(p => {
                    const { project: mp, newPackageDefs } = migrateProjectPackages(p, [...loadedPackages, ...allNewDefs]);
                    allNewDefs = [...allNewDefs, ...newPackageDefs];
                    return mp;
                });
                if (allNewDefs.length > 0) {
                    loadedPackages = [...loadedPackages, ...allNewDefs];
                    setPackages(loadedPackages);
                }
                if (pkgMigratedProjects.some((p, i) => p !== migratedProjects[i])) {
                    setProjects(pkgMigratedProjects);
                }

                if (data.templates) setTemplates(data.templates);
            } catch (e) { console.error('Failed to load saved data', e); }
        } else {
            // Migrate from old single-project format
            const oldSaved = localStorage.getItem('av-estimator-data');
            if (oldSaved) {
                try {
                    const oldData = JSON.parse(oldSaved);
                    if (oldData.project?.locations?.length > 0) {
                        const migratedProject = {
                            ...oldData.project,
                            id: Date.now().toString(),
                            status: 'developing',
                            client: '',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        };
                        setProjects([migratedProject]);
                    }
                    if (oldData.packages?.length > 0) setPackages(oldData.packages);
                    if (oldData.templates) setTemplates(oldData.templates);
                } catch (e) { console.error('Failed to migrate old data'); }
            }
        }
        hasLoaded.current = true;
    }, []);

    // Sync with Supabase after login
    useEffect(() => {
        if (!supabase || !session || !hasLoaded.current) return;
        const syncFromSupabase = async () => {
            setSyncStatus('syncing');
            try {
                // Pull remote projects — filter by team or user
                let projQuery = supabase.from('projects').select('id, data, updated_at');
                if (team) {
                    projQuery = projQuery.eq('team_id', team.id);
                } else {
                    projQuery = projQuery.eq('user_id', session.user.id);
                }
                const { data: remoteRows, error: projErr } = await projQuery;
                if (!projErr && remoteRows?.length > 0) {
                    const remote = remoteRows.map(r => r.data);
                    setProjects(prev => {
                        const merged = {};
                        [...prev, ...remote].forEach(p => {
                            if (!merged[p.id] || new Date(p.updatedAt) > new Date(merged[p.id].updatedAt)) {
                                merged[p.id] = p;
                            }
                        });
                        return Object.values(merged);
                    });
                }

                // Pull remote packages/templates — filter by team or user
                let settQuery = supabase.from('user_settings').select('packages, templates');
                if (team) {
                    settQuery = settQuery.eq('team_id', team.id);
                } else {
                    settQuery = settQuery.eq('user_id', session.user.id);
                }
                const { data: settings } = await settQuery.maybeSingle();
                if (settings) {
                    // Merge packages by ID — newer updatedAt wins (supports multi-device sync)
                    if (settings.packages?.length > 0) {
                        setPackages(prev => {
                            const merged = {};
                            [...prev, ...settings.packages].forEach(p => {
                                if (!merged[p.id] || new Date(p.updatedAt || 0) > new Date(merged[p.id].updatedAt || 0)) {
                                    merged[p.id] = p;
                                }
                            });
                            return Object.values(merged);
                        });
                    }
                    if (settings.templates && Object.keys(settings.templates).length > 0) setTemplates(prev => Object.keys(prev).length > 0 ? prev : settings.templates);
                }

                // Pull catalog customizations if on a team (includes edits, deletions, favorites, notes)
                if (team) {
                    const { data: customizations } = await supabase
                        .from('catalog_customizations')
                        .select('*')
                        .eq('team_id', team.id)
                        .limit(5000);
                    if (customizations?.length > 0) {
                        setCatalog(prev => {
                            const customMap = {};
                            customizations.forEach(c => { customMap[c.catalog_item_id] = c; });
                            return prev.map(item => {
                                const custom = customMap[item.id];
                                if (custom) {
                                    let merged = { ...item, favorite: custom.favorite, catalogNote: custom.catalog_note, deleted: !!custom.deleted };
                                    // Apply full field overrides if custom_fields exists
                                    if (custom.custom_fields) {
                                        try {
                                            const fields = typeof custom.custom_fields === 'string' ? JSON.parse(custom.custom_fields) : custom.custom_fields;
                                            // After a catalog version refresh, don't let stale Supabase categories overwrite new base catalog
                                            if (catalogVersionRefreshed.current) { delete fields.category; delete fields.subcategory; }
                                            merged = { ...merged, ...fields };
                                        } catch (e) { console.error('Failed to parse custom_fields', e); }
                                    }
                                    return merged;
                                }
                                return item;
                            });
                        });
                    }
                }

                setSyncStatus('synced');
            } catch (err) {
                console.error('Supabase sync error:', err);
                setSyncStatus('error');
            }
        };
        syncFromSupabase();
    }, [session, team]);

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
            setProject(JSON.parse(history[historyIndex - 1]));
            showToast('Undo');
        }
    };
    
    const redo = () => {
        if (historyIndex < history.length - 1) {
            isUndoRedo.current = true;
            setHistoryIndex(historyIndex + 1);
            setProject(JSON.parse(history[historyIndex + 1]));
            showToast('Redo');
        }
    };
    
    const showToast = (msg) => {
        setToast(msg);
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
        setPackages(prev => updatePkgItems(prev));
        setProject(p => ({
            ...p,
            locations: updateLocs(p.locations),
            packages: p.packages ? updatePkgItems(p.packages) : p.packages,
        }));
    };

    // Sync all instances of a package to a specific version
    const syncPackageInstances = (packageId, newVersion) => {
        const updateLocs = (locs) => locs.map(loc => ({
            ...loc,
            items: (loc.items || []).map(item =>
                item.type === 'package' && item.packageId === packageId
                    ? { ...item, packageVersion: newVersion }
                    : item
            ),
            children: loc.children ? updateLocs(loc.children) : loc.children,
        }));
        setProject(p => ({ ...p, locations: updateLocs(p.locations) }));
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
        const newLocs = names.map(name => ({ id: Date.now().toString() + Math.random().toString(36).substr(2, 9), name, children: [], items: [] }));
        if (!parentId) {
            setProject(p => ({ ...p, locations: [...p.locations, ...newLocs] }));
        } else {
            const addToParent = locs => locs.map(l => l.id === parentId ? { ...l, children: [...(l.children || []), ...newLocs] } : l.children ? { ...l, children: addToParent(l.children) } : l);
            setProject(p => ({ ...p, locations: addToParent(p.locations) }));
            if (selected?.id === parentId) setSelected(s => ({ ...s, children: [...(s.children || []), ...newLocs] }));
        }
    };

    const deleteLocation = (id) => {
        const removeFromTree = locs => locs.filter(l => l.id !== id).map(l => l.children ? { ...l, children: removeFromTree(l.children) } : l);
        setProject(p => ({ ...p, locations: removeFromTree(p.locations) }));
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
        
        setProject(p => ({ ...p, locations: addSiblings(p.locations, location.id, newLocs) }));
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

    const updateItems = (id, items) => {
        const upd = locs => locs.map(l => l.id === id ? { ...l, items } : l.children ? { ...l, children: upd(l.children) } : l);
        setProject(p => ({ ...p, locations: upd(p.locations) }));
        if (selected?.id === id) setSelected(s => ({ ...s, items }));
    };
    
    const renameLocation = (id, newName) => {
        const upd = locs => locs.map(l => l.id === id ? { ...l, name: newName } : l.children ? { ...l, children: upd(l.children) } : l);
        setProject(p => ({ ...p, locations: upd(p.locations) }));
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
    const handleUngroupPackage = (packageName) => {
        if (!selected) return;
        const items = selected.items.map(item => {
            if (item.packageName === packageName) {
                const { packageName: _, ...rest } = item;
                return rest;
            }
            return item;
        });
        updateItems(selected.id, items);
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
    
    // Add item to catalog
    const handleAddToCatalog = (item) => {
        // Check if item already exists in catalog (by part number or manufacturer+model)
        const exists = catalog.find(c => 
            (c.partNumber && c.partNumber === item.partNumber) ||
            (c.manufacturer === item.manufacturer && c.model === item.model)
        );
        
        if (exists && !exists.deleted) {
            showToast('Item already exists in catalog');
            return;
        }
        
        const newCatalogItem = {
            id: generateCatalogId(),
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
            modifiedAt: new Date().toISOString(),
        };
        
        setCatalog(prev => [...prev, newCatalogItem]);
        showToast(`Added "${item.manufacturer} ${item.model}" to catalog`);
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
                            <CatalogView
                                catalog={catalog}
                                onUpdateCatalog={updateCatalog}
                                onRefreshCatalog={refreshCatalog}
                                onSaveCatalog={saveCatalog}
                                syncStatus={catalogSyncStatus}
                                catalogDirty={catalogDirty}
                                compactMode={compactMode}
                            />
                        )}
                        {dashboardCatalogTab === 'packages' && (
                            <PackagesView
                                catalogPackages={packages}
                                projectPackages={[]}
                                onUpdateCatalogPackages={setPackages}
                                onUpdateProjectPackages={() => {}}
                                catalog={catalog}
                                locations={[]}
                                onSyncInstances={() => {}}
                            />
                        )}
                    </main>
                    {toast && <div style={styles.toast}>{toast}</div>}
                </div>
            );
        }
        return (
            <>
                <ProjectsHome
                    projects={projects}
                    onOpen={openProject}
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
                />
                {showNewProjectModal && (
                    <NewProjectModal
                        onClose={() => setShowNewProjectModal(false)}
                        onCreate={(data) => {
                            const id = createProject(data);
                            openProject(id);
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
                            openProject(editingProject.id);
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
                {toast && <div style={styles.toast}>{toast}</div>}
            </>
        );
    }

    return (
        <div style={styles.app}>
            <header style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                        style={{ ...styles.iconButton, color: '#8b98a5' }} 
                        onClick={closeProject}
                        title="Back to Projects">
                        <Icons.ChevronLeft />
                    </button>
                    <div style={styles.logo}><Icons.Zap /> {project.name}</div>
                    {projectReadOnly && (
                        <span style={{ ...styles.badge(''), backgroundColor: '#3d1a1a', color: '#f87171', fontSize: '11px' }}>
                            <Icons.Lock /> Read-Only — checked out by {checkedOutBy}
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
                            {project.currentRevision
                                ? (project.revisions.find(r => r.id === project.currentRevision) || {}).label || 'Revision'
                                : `${project.revisions.length} Rev${project.revisions.length > 1 ? 's' : ''}`
                            }
                        </span>
                    )}
                    {project.currentRevision && (
                        <button
                            style={{ ...styles.iconButton, color: '#f59e0b', padding: '2px', fontSize: '12px' }}
                            title="Close current revision. Next change will require a new revision."
                            onClick={() => { if (confirm('Close revision "' + ((project.revisions?.find(r => r.id === project.currentRevision) || {}).label || '') + '"?\nNext change will require a new revision.')) closeRevision(); }}
                        >
                            <Icons.X />
                        </button>
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
                            onClick={() => setViewingRevisionId(null)}>
                            Return to Current
                        </button>
                        <button
                            style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c' }}
                            onClick={() => {
                                if (confirm(`Restore "${viewingRevision.label}"?\n\nYour current state will be saved as a revision first.`)) {
                                    restoreRevision(viewingRevisionId);
                                }
                            }}>
                            <Icons.RotateCcw /> Restore This Revision
                        </button>
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
                        <aside style={styles.sidebar}>
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
                                        style={{ ...styles.smallButton, flex: '1 1 auto', backgroundColor: '#1a2e1a', color: '#4ade80', fontSize: '11px' }}
                                        onClick={() => { multiSelectLocations.forEach(loc => promoteLocation(loc.id)); setMultiSelectLocations([]); }}>
                                        <Icons.ChevronLeft /> Promote ({multiSelectLocations.length})
                                    </button>
                                    <button
                                        style={{ ...styles.smallButton, flex: '1 1 auto', backgroundColor: '#1a2e3d', color: '#60a5fa', fontSize: '11px' }}
                                        onClick={() => { multiSelectLocations.forEach(loc => demoteLocation(loc.id)); setMultiSelectLocations([]); }}>
                                        <Icons.ChevronRight /> Demote ({multiSelectLocations.length})
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
                                        onSelect={(loc) => { setMultiSelectLocations([]); setSelected(loc); }}
                                        onDelete={(loc) => { setDeleteTargets([loc]); setShowDelete(true); }}
                                        onRename={renameLocation}
                                        onDuplicate={(loc) => { setDuplicateTarget(loc); setShowDuplicate(true); }}
                                        onMoveUp={moveLocationUp}
                                        onMoveDown={moveLocationDown}
                                        onPromote={promoteLocation}
                                        onDemote={demoteLocation}
                                        multiSelect={multiSelectLocations}
                                        onMultiSelectToggle={(loc, e) => {
                                            if (e?.shiftKey && lastMultiSelectLocRef.current) {
                                                // Shift+click: select range of visible locations
                                                const flattenVisible = (locs) => {
                                                    let result = [];
                                                    for (const l of locs) {
                                                        result.push(l);
                                                        if (l.children?.length > 0 && expandedLocations[l.id]) {
                                                            result = result.concat(flattenVisible(l.children));
                                                        }
                                                    }
                                                    return result;
                                                };
                                                const flat = flattenVisible(effectiveLocations);
                                                const idxA = flat.findIndex(l => l.id === lastMultiSelectLocRef.current);
                                                const idxB = flat.findIndex(l => l.id === loc.id);
                                                if (idxA !== -1 && idxB !== -1) {
                                                    const start = Math.min(idxA, idxB);
                                                    const end = Math.max(idxA, idxB);
                                                    const range = flat.slice(start, end + 1);
                                                    setMultiSelectLocations(prev => {
                                                        const combined = [...prev];
                                                        range.forEach(r => { if (!combined.some(c => c.id === r.id)) combined.push(r); });
                                                        return combined;
                                                    });
                                                }
                                            } else {
                                                // Ctrl+click: toggle individual
                                                setMultiSelectLocations(prev =>
                                                    prev.some(l => l.id === loc.id)
                                                        ? prev.filter(l => l.id !== loc.id)
                                                        : [...prev, loc]
                                                );
                                            }
                                            lastMultiSelectLocRef.current = loc.id;
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
                                        catalogPkgs={packages}
                                        projectPkgs={effectivePackages}
                                        onReplaceItem={(itemIdx) => handleReplaceItem(itemIdx)}
                                        onReplacePackage={(packageName, itemIdx) => handleReplacePackage(packageName, itemIdx)}
                                        searchFilter={workspaceSearch}
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
                                    catalogPkgs={packages}
                                    projectPkgs={effectivePackages}
                                    filterMode={viewMode === 'unfinished' ? 'unfinished' : undefined}
                                    onReplaceItem={(itemIdx, locationId) => handleReplaceItem(itemIdx, locationId)}
                                    onReplacePackage={(packageName, itemIdx, locationId) => handleReplacePackage(packageName, itemIdx, locationId)}
                                    searchFilter={workspaceSearch}
                                />
                            )}
                        </section>
                    </>
                )}

                {tab === 'catalog' && (
                    <section style={{ ...styles.content, marginLeft: 0 }}>
                        <CatalogView
                            catalog={catalog}
                            onUpdateCatalog={updateCatalog}
                            onRefreshCatalog={refreshCatalog}
                            onSaveCatalog={saveCatalog}
                            syncStatus={catalogSyncStatus}
                            catalogDirty={catalogDirty}
                            compactMode={compactMode}
                        />
                    </section>
                )}
                {tab === 'packages' && <section style={{ ...styles.content, marginLeft: 0 }}><PackagesView catalogPackages={packages} projectPackages={effectivePackages || []} onUpdateCatalogPackages={setPackages} onUpdateProjectPackages={setProjectDirect} catalog={catalog} locations={effectiveLocations || []} onSyncInstances={syncPackageInstances} /></section>}
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
                            {/* Export to Procore Estimating */}
                            <div style={styles.card}>
                                <div style={styles.cardTitle}>Procore Estimating Import</div>
                                <p style={{ color: '#8b98a5', fontSize: '14px', margin: '0 0 16px 0' }}>Complete estimate with location sheets, labor, and phase codes.</p>
                                <button style={styles.button('primary')} onClick={exportProcoreEstimate}><Icons.Download /> Export</button>
                            </div>
                            {/* Labor by Phase */}
                            <div style={styles.card}>
                                <div style={styles.cardTitle}>Labor by Phase</div>
                                <p style={{ color: '#8b98a5', fontSize: '14px', margin: '0 0 16px 0' }}>Labor hours breakdown by phase per location/group.</p>
                                <button style={styles.button('primary')} onClick={() => setShowLaborByPhase(!showLaborByPhase)}>{showLaborByPhase ? 'Hide' : 'Show'} Report</button>
                            </div>
                        </div>

                        {/* Editable Consolidated BOM Table */}
                        {(() => {
                            const bomItems = getConsolidatedBOM();
                            if (bomItems.length === 0) return <p style={{ color: '#8b98a5' }}>No components in project. Add items to locations to see the consolidated BOM.</p>;
                            let totalCost = 0, totalLabor = 0;
                            bomItems.forEach(b => { totalCost += b.totalQty * b.unitCost; totalLabor += b.totalQty * b.laborHrsPerUnit; });
                            return (
                                <div>
                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Consolidated BOM
                                        <span style={{ fontSize: '13px', color: '#8b98a5', fontWeight: '400' }}>({fmtQty(bomItems.length)} unique items — {fmtCost(totalCost)} — {fmtHrs(totalLabor)})</span>
                                    </h3>
                                    <p style={{ color: '#8b98a5', fontSize: '13px', margin: '0 0 12px 0' }}>Edit Unit Cost or Unit Labor below to update all matching items across all locations.</p>
                                    <div style={{ overflowX: 'auto', border: '1px solid #2f3336', borderRadius: '8px' }}>
                                        <table style={{ ...styles.table, fontSize: '13px' }}>
                                            <colgroup>
                                                {bomCols.map(col => <col key={col.id} style={{ width: col.width }} />)}
                                            </colgroup>
                                            <thead>
                                                <tr style={{ background: '#161b22' }}>
                                                    {bomCols.map((col, colIndex) => (
                                                        <th key={col.id} style={{ ...styles.th, ...styles.thResizable }}>
                                                            {col.label}
                                                            <div
                                                                style={styles.resizeHandle}
                                                                onMouseDown={e => startBomResize(colIndex, e)}
                                                                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                                            />
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bomItems.map((b, idx) => {
                                                    return (
                                                        <React.Fragment key={b.key}>
                                                            <tr style={{ borderBottom: '1px solid #2f3336' }} title={b.locations.join(', ')}>
                                                                {bomCols.map(col => {
                                                                    switch (col.id) {
                                                                        case 'qty': return <td key={col.id} style={styles.td}>{fmtQty(b.totalQty)}</td>;
                                                                        case 'manufacturer': return <td key={col.id} style={styles.td}>{b.manufacturer}</td>;
                                                                        case 'model': return <td key={col.id} style={{ ...styles.td, fontWeight: '600' }}>{b.model}</td>;
                                                                        case 'partNumber': return <td key={col.id} style={{ ...styles.td, fontSize: '12px', color: '#8b98a5' }}>{b.partNumber}</td>;
                                                                        case 'description': return <td key={col.id} style={styles.td}>{b.description}</td>;
                                                                        case 'unitCost': return <td key={col.id} style={styles.td}><input type="number" step="0.01" min="0" value={b.unitCost} onChange={e => updateConsolidatedField(b.key, 'unitCost', e.target.value)} style={{ ...styles.input, width: '80px', padding: '4px 6px', fontSize: '12px', textAlign: 'right' }} /></td>;
                                                                        case 'laborHrsPerUnit': return <td key={col.id} style={styles.td}><input type="number" step="0.01" min="0" value={b.laborHrsPerUnit} onChange={e => updateConsolidatedField(b.key, 'laborHrsPerUnit', e.target.value)} style={{ ...styles.input, width: '80px', padding: '4px 6px', fontSize: '12px', textAlign: 'right' }} /></td>;
                                                                        case 'extCost': return <td key={col.id} style={{ ...styles.td, color: '#00ba7c', fontWeight: '600' }}>{fmtCost(b.totalQty * b.unitCost)}</td>;
                                                                        case 'extLabor': return <td key={col.id} style={styles.td}>{fmtHrs(b.totalQty * b.laborHrsPerUnit)}</td>;
                                                                        default: return <td key={col.id} style={styles.td}></td>;
                                                                    }
                                                                })}
                                                            </tr>
                                                        </React.Fragment>
                                                    );
                                                })}
                                                <tr style={{ background: '#161b22', fontWeight: '700' }}>
                                                    <td colSpan={bomCols.length - 2} style={{ ...styles.td, textAlign: 'right' }}>TOTALS</td>
                                                    <td style={{ ...styles.td, color: '#00ba7c' }}>{fmtCost(totalCost)}</td>
                                                    <td style={styles.td}>{fmtHrs(totalLabor)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Labor by Phase Report */}
                        {showLaborByPhase && (
                            <div style={{ marginTop: '24px' }}>
                                <LaborByPhaseReport
                                    locations={effectiveLocations}
                                    catalogPkgs={packages}
                                    projectPkgs={effectivePackages || []}
                                    hierarchyGroups={reportHierarchyDepth === -1 ? null : getGroupedByHierarchy(effectiveLocations, reportHierarchyDepth, packages, effectivePackages || [])}
                                />
                            </div>
                        )}
                    </section>
                )}
            </main>

            {showSearch && <SearchModal catalog={catalog} packages={packages} projectPackages={project.packages || []} onClose={() => { setShowSearch(false); setReplaceContext(null); }} onInsert={replaceContext ? (items) => handleReplaceSelect(items[0]) : checkDiscontinuedAndInsert} onInsertPkg={replaceContext?.isPackage ? (pkg) => handleReplaceSelect(pkg) : insertPkg} replaceMode={!!replaceContext} replaceIsPackage={replaceContext?.isPackage} />}

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
            
            {/* Revision Prompt Modal */}
            {showRevisionPrompt && (
                <RevisionPromptModal
                    project={pendingRevisionProjectId ? (projects.find(p => p.id === pendingRevisionProjectId) || project) : project}
                    onClose={() => { setShowRevisionPrompt(false); setPendingMutation(null); setPendingRevisionProjectId(null); setRevisionPromptLabelOverride(null); setRevisionPromptManualCreate(false); }}
                    onCreateRevision={createRevision}
                    suggestedLabelOverride={revisionPromptLabelOverride}
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
            
            {/* Toast Notification */}
            {toast && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '12px', backgroundColor: '#1a3d2e', border: '1px solid #2d4a3e', color: '#00ba7c', fontSize: '14px', fontWeight: '500', zIndex: 2000 }}>
                    {toast}
                </div>
            )}
        </div>
    );
}

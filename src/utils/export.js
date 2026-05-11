import * as XLSX from 'xlsx';
import { getFlattenedItems } from './packages';

// Generate Esticom-compatible BoM workbook for a single location
export function generateEsticomWorkbook(location, catalogPkgs, projectPkgs) {
    const wb = XLSX.utils.book_new();

    // Use getFlattenedItems to expand package instances into individual items
    const flatItems = getFlattenedItems(location, catalogPkgs, projectPkgs);

    // Consolidate all items + accessories into unique part numbers
    const partMap = {};
    for (const item of flatItems) {
        const key = item.partNumber || (item.manufacturer + '|' + item.model);
        if (partMap[key]) {
            partMap[key].qty += (item.qty || 0);
        } else {
            partMap[key] = {
                qty: item.qty || 0,
                name: item.model || '',
                manufacturer: item.manufacturer || '',
                supplier: item.vendor || '',
                partNumber: item.partNumber || '',
                uom: item.uom || 'EA',
                unitCost: item.unitCost || 0
            };
        }
        // Include accessories as their own line items
        if (item.accessories) {
            for (const acc of item.accessories) {
                const accKey = acc.partNumber || (acc.manufacturer + '|' + acc.model);
                if (partMap[accKey]) {
                    partMap[accKey].qty += (acc.qty || 0);
                } else {
                    partMap[accKey] = {
                        qty: acc.qty || 0,
                        name: acc.model || '',
                        manufacturer: acc.manufacturer || '',
                        supplier: acc.vendor || '',
                        partNumber: acc.partNumber || '',
                        uom: acc.uom || 'EA',
                        unitCost: acc.unitCost || 0
                    };
                }
            }
        }
    }

    // Build array-of-arrays matching Esticom template layout
    const data = [];
    data.push([]);  // Row 1: empty
    data.push(['BILL OF MATERIALS (Import Template)', '', '', '', '', '', '']);  // Row 2: title
    data.push([]);  // Row 3: empty
    data.push([]);  // Row 4: empty
    data.push(['QTY', 'Name', 'Manufacturer', 'Supplier', 'Part Number', 'UOM', 'Item Cost']);  // Row 5: headers
    data.push([]);  // Row 6: blank separator

    // Row 7+: consolidated data rows
    for (const part of Object.values(partMap)) {
        data.push([
            part.qty,
            part.name,
            part.manufacturer,
            part.supplier,
            part.partNumber,
            part.uom,
            part.unitCost
        ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Merge title row A2:G2
    ws['!merges'] = [
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }
    ];

    // Column widths matching Esticom template
    ws['!cols'] = [
        { wch: 5 },    // A: QTY
        { wch: 30 },   // B: Name
        { wch: 14 },   // C: Manufacturer
        { wch: 12 },   // D: Supplier
        { wch: 13 },   // E: Part Number
        { wch: 10 },   // F: UOM
        { wch: 10 },   // G: Item Cost
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Bill of materials');
    return wb;
}

// Generate Procore Estimating (Esticom) complete estimate import workbook
// Single xlsx with one sheet per location group, matching the importTemplate format
export function generateProcoreEstimateWorkbook(locations, catalogPkgs, projectPkgs, projectName) {
    const wb = XLSX.utils.book_new();
    const headers = ['QTY', 'Name', 'Description', 'Manufacturer', 'Part Number', 'Supplier', 'UOM', 'Item Cost', 'Labor (Hours)', 'Phase', 'Type'];

    // Map our UOM values to Procore-compatible values
    const mapUOM = (uom) => {
        const u = (uom || 'EA').toUpperCase();
        const map = { 'EA': 'Ea', 'FT': 'Ft', 'SQFT': 'SqFt', 'CUFT': 'CuFt', 'LF': 'Ft', 'GAL': 'Gal', 'LB': 'Lb', 'YD': 'Yd' };
        return map[u] || 'Ea';
    };

    // Collect all leaf locations with items
    const collectLeaves = (locs, parentPath) => {
        let leaves = [];
        for (const loc of locs) {
            const path = parentPath ? `${parentPath} > ${loc.name}` : loc.name;
            const flatItems = getFlattenedItems(loc, catalogPkgs, projectPkgs);
            if (flatItems.length > 0 && (!loc.children || loc.children.length === 0)) {
                leaves.push({ name: loc.name, path, items: flatItems });
            }
            if (loc.children) {
                leaves.push(...collectLeaves(loc.children, path));
            }
        }
        return leaves;
    };

    const allLeaves = collectLeaves(locations, '');
    if (allLeaves.length === 0) return null;

    // Build consolidated part map per location
    for (const leaf of allLeaves) {
        const partMap = {};
        for (const item of leaf.items) {
            const key = item.partNumber || (item.manufacturer + '|' + item.model);
            if (partMap[key]) {
                partMap[key].qty += (item.qty || 0);
            } else {
                partMap[key] = {
                    qty: item.qty || 0,
                    name: item.model || '',
                    description: item.description || '',
                    manufacturer: item.manufacturer || '',
                    partNumber: item.partNumber || '',
                    supplier: item.vendor || '',
                    uom: mapUOM(item.uom),
                    unitCost: item.unitCost || 0,
                    laborHrs: item.laborHrsPerUnit || 0,
                    phase: item.phase || '',
                    type: 'Part',
                };
            }
            if (item.accessories) {
                for (const acc of item.accessories) {
                    const accKey = acc.partNumber || (acc.manufacturer + '|' + acc.model);
                    if (partMap[accKey]) {
                        partMap[accKey].qty += (acc.qty || 0);
                    } else {
                        partMap[accKey] = {
                            qty: acc.qty || 0,
                            name: acc.model || '',
                            description: acc.description || '',
                            manufacturer: acc.manufacturer || '',
                            partNumber: acc.partNumber || '',
                            supplier: acc.vendor || '',
                            uom: mapUOM(acc.uom),
                            unitCost: acc.unitCost || 0,
                            laborHrs: acc.laborHrsPerUnit || 0,
                            phase: acc.phase || '',
                            type: 'Part',
                        };
                    }
                }
            }
        }

        const data = [];
        data.push([]);
        data.push([leaf.path || leaf.name, '', '', '', '', '', '', '', '', '', '']);
        data.push([]);
        data.push([]);
        data.push(headers);
        data.push([]);

        for (const part of Object.values(partMap)) {
            data.push([
                part.qty,
                part.name,
                part.description,
                part.manufacturer,
                part.partNumber,
                part.supplier,
                part.uom,
                part.unitCost,
                part.laborHrs,
                part.phase,
                part.type,
            ]);
        }

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 10 } }];
        ws['!cols'] = [
            { wch: 5 },   // QTY
            { wch: 25 },  // Name (model)
            { wch: 30 },  // Description
            { wch: 16 },  // Manufacturer
            { wch: 18 },  // Part Number
            { wch: 14 },  // Supplier
            { wch: 6 },   // UOM
            { wch: 10 },  // Item Cost
            { wch: 10 },  // Labor (Hours)
            { wch: 18 },  // Phase
            { wch: 8 },   // Type
        ];

        // Sanitize sheet name (max 31 chars, no special chars)
        let sheetName = (leaf.name || 'Location').replace(/[\\/*?:\[\]]/g, '-').substring(0, 31);
        // Ensure unique sheet name
        let suffix = 1;
        let baseName = sheetName;
        while (wb.SheetNames.includes(sheetName)) {
            sheetName = baseName.substring(0, 28) + ' (' + suffix + ')';
            suffix++;
        }
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    // Add a summary sheet at the beginning
    const summaryData = [[], [projectName || 'Project Estimate', '', '', '', '', ''], [], [],
        ['Location', 'Items', 'Material Cost', 'Labor Hours', '', ''], []];
    for (const leaf of allLeaves) {
        let matCost = 0, labHrs = 0, itemCount = 0;
        const flatItems = leaf.items;
        for (const item of flatItems) {
            matCost += (item.qty || 0) * (item.unitCost || 0);
            labHrs += (item.qty || 0) * (item.laborHrsPerUnit || 0);
            itemCount += (item.qty || 0);
            if (item.accessories) {
                for (const acc of item.accessories) {
                    matCost += (acc.qty || 0) * (acc.unitCost || 0);
                    labHrs += (acc.qty || 0) * (acc.laborHrsPerUnit || 0);
                    itemCount += (acc.qty || 0);
                }
            }
        }
        summaryData.push([leaf.path || leaf.name, itemCount, matCost, labHrs]);
    }
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }];
    summaryWs['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 14 }, { wch: 12 }];
    // Insert summary as first sheet
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    // Move summary to front
    const sheetOrder = wb.SheetNames;
    sheetOrder.unshift(sheetOrder.pop());
    return wb;
}

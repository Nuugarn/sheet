"use strict";

window.localData = (() => {
  const appName = "klao-built-in";
  const version = 4;
  const currentKey = "current";
  const previousKey = "before-restore";
  const legacyKey = "klao-work-prototype-tasks-v1";
  const storeName = "workspace";
  const stages = ["วัดหน้างาน", "ออกแบบและอนุมัติ", "ผลิต", "ติดตั้ง", "ตรวจงาน", "ส่งมอบแล้ว"];
  let database;
  let zipLoading;

  const createId = () => crypto.randomUUID();
  const validId = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
  const validText = (value, length, required = false) =>
    typeof value === "string" && value.length <= length && (!required || value.trim().length > 0);
  const validIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;
  const validMoney = (value) => Number.isSafeInteger(value) && value > 0;
  const uniqueIds = (items) => new Set(items.map((item) => item.id)).size === items.length;
  const sum = (items, field) => items.reduce((total, item) => total + item[field], 0);
  const paidAmount = (installment) => installment.payments.reduce((total, payment) =>
    total + (payment.cancelledOn ? 0 : payment.amountSatang), 0);

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validLink(value) {
    if (!validText(value, 2048, true)) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  async function readPdf(file) {
    if (!(file instanceof Blob) || !file.size) throw new Error("Empty PDF");
    const header = await file.slice(0, 1024).text();
    if (!/^%PDF-\d+\.\d+/.test(header.trimStart())) throw new Error("Invalid PDF");
    return file.slice(0, file.size, "application/pdf");
  }

  function validDocument(doc, fromArchive) {
    if (!doc || !validId(doc.id) || !validText(doc.title, 120, true)) return false;
    if (doc.url !== undefined) return validLink(doc.url) && doc.pdf === undefined && doc.pdfSize === undefined;
    if (!validText(doc.fileName, 512, true)) return false;
    return fromArchive
      ? Number.isSafeInteger(doc.pdfSize) && doc.pdfSize > 0
      : doc.pdf instanceof Blob && doc.pdf.type === "application/pdf" && doc.pdf.size > 0;
  }

  function toSatang(value) {
    const input = String(value).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return NaN;
    const [whole, fraction = ""] = input.split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return validMoney(amount) ? amount : NaN;
  }

  function validProject(project, fromArchive) {
    return project && validId(project.id) && validText(project.name, 100, true)
      && validText(project.place, 160) && validMoney(project.contractSatang)
      && typeof project.sample === "boolean"
      && Array.isArray(project.stages) && project.stages.length > 0
      && project.stages.every((stage) => validText(stage, 100, true))
      && validIndex(project.stageStart, project.stages.length)
      && validIndex(project.stageIndex, project.stages.length)
      && project.stageIndex >= project.stageStart
      && Array.isArray(project.installments) && project.installments.every(validInstallment)
      && uniqueIds(project.installments)
      && sum(project.installments, "amountSatang") <= project.contractSatang
      && Array.isArray(project.documents) && project.documents.every((doc) => validDocument(doc, fromArchive))
      && uniqueIds(project.documents);
  }

  function validInstallment(item) {
    return item && validId(item.id) && validText(item.label, 100, true)
      && validMoney(item.amountSatang) && typeof item.billed === "boolean"
      && Array.isArray(item.payments) && item.payments.every((payment) =>
        payment && validId(payment.id) && validMoney(payment.amountSatang)
        && (payment.date === null || validDate(payment.date))
        && (payment.cancelledOn == null || validDate(payment.cancelledOn)))
      && uniqueIds(item.payments) && paidAmount(item) <= item.amountSatang;
  }

  function validTask(task, project) {
    return task && validId(task.id) && validText(task.title, 120, true)
      && validDate(task.date) && typeof task.done === "boolean"
      && (task.time === "" || (typeof task.time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(task.time)))
      && validText(task.note, 500)
      && (task.completedOn == null || validDate(task.completedOn))
      && (task.project === null
        ? task.stage === null
        : project && project.id === task.project && (task.stage === null || validIndex(task.stage, project.stages.length)));
  }

  function validWorkspace(data, fromArchive = false) {
    if (!data || !Array.isArray(data.projects) || !data.projects.every((project) => validProject(project, fromArchive))
        || !uniqueIds(data.projects) || !Array.isArray(data.tasks)) return false;
    const projectById = new Map(data.projects.map((project) => [project.id, project]));
    return data.tasks.every((task) => validTask(task, projectById.get(task?.project))) && uniqueIds(data.tasks);
  }

  function sampleProject(id, name, place, stagesForProject, contract, rows) {
    return {
      id, name, place, stages: stagesForProject, stageIndex: 0, stageStart: 0,
      contractSatang: contract * 100, sample: true, documents: [],
      installments: rows.map(([label, amount, paid, billed], index) => ({
        id: id + "-i" + (index + 1), label, amountSatang: amount * 100, billed,
        payments: paid ? [{ id: id + "-p" + (index + 1), amountSatang: paid * 100, date: null }] : []
      }))
    };
  }

  function seed(today, future) {
    const projects = [
      sampleProject("h1", "บ้านคุณอร", "หนองจอก", ["กำลังติดตั้งหน้าบาน", "ตรวจงาน", "ส่งมอบแล้ว"], 242750, [
        ["เริ่มงาน", 50000, 50000, true], ["วัสดุเข้าหน้างาน", 50000, 50000, true], ["ติดตั้งโครงตู้", 50000, 20000, true],
        ["ติดตั้งหน้าบาน", 50000, 0, false], ["ส่งมอบงาน", 42750, 0, false]
      ]),
      sampleProject("h2", "บ้านคุณนัท", "มีนบุรี", ["รอลูกค้าเลือกสี", "ผลิต", "ติดตั้ง", "ตรวจงาน", "ส่งมอบแล้ว"], 82500, [
        ["มัดจำ", 25000, 25000, true], ["เริ่มผลิต", 32500, 0, false], ["ส่งมอบงาน", 25000, 0, false]
      ]),
      sampleProject("h3", "บ้านคุณพิม", "ลาดกระบัง", ["นัดตรวจงาน", "ส่งมอบงาน", "ส่งมอบแล้ว"], 96000, [
        ["มัดจำ", 48000, 48000, true], ["ติดตั้ง", 30000, 30000, true], ["ส่งมอบงาน", 18000, 0, false]
      ])
    ];
    const exampleTasks = [
      { id: "t1", project: "h1", title: "เช็กของก่อนเข้าติดตั้ง", date: today, time: "09:00", note: "เช็กบานพับ มือจับ และจำนวนหน้าบาน", done: true },
      { id: "t2", project: "h1", title: "ติดตั้งหน้าบานตู้ทีวี", date: today, time: "10:30", note: "นัดช่างเข้าพร้อมตัวอย่างสี", done: false },
      { id: "t3", project: "h2", title: "ส่งตัวอย่างสีให้ลูกค้า", date: today, time: "13:00", note: "เตรียมลามิเนตโทนไม้ 2 แบบ", done: false },
      { id: "t4", project: "h3", title: "นัดตรวจงานบิวท์อิน", date: today, time: "15:30", note: "ตรวจแนวหน้าบานและไฟใต้ชั้น", done: false },
      { id: "t5", project: "h1", title: "วางบิลงวดติดตั้ง", date: future, time: "11:00", note: "", done: false }
    ];
    const legacy = localStorage.getItem(legacyKey);
    const oldTasks = legacy === null ? exampleTasks : JSON.parse(legacy);
    const linkedExamples = { t2: "h1", t4: "h3" };
    const tasks = oldTasks.map((task) => ({
      ...task, stage: linkedExamples[task.id] === task.project ? 0 : null
    }));
    const result = { projects, tasks };
    if (!validWorkspace(result)) throw new Error("Invalid legacy workspace");
    projects.forEach((project) => advanceStage(project, tasks));
    return result;
  }

  function advanceStage(project, tasks) {
    let index = project.stageStart;
    while (index < project.stages.length - 1) {
      const required = tasks.filter((task) => task.project === project.id && task.stage === index);
      if (required.length === 0 || required.some((task) => !task.done)) break;
      index += 1;
    }
    project.stageIndex = index;
  }

  function open() {
    if (!database) {
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open(appName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(storeName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return database;
  }

  async function transact(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let output;
      let failure;

      const handle = (request, callback) => {
        request.onsuccess = () => {
          try {
            output = callback(request.result);
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
      };
      tx.oncomplete = () => resolve(output);
      tx.onabort = () => reject(failure || tx.error || new Error("Database transaction aborted"));
      operation(store, handle);
    });
  }

  function load(today, future) {
    return transact("readwrite", (store, handle) => {
      handle(store.get(currentKey), (existing) => {
        if (existing) return existing;
        const migrated = seed(today, future);
        store.put(migrated, currentKey);
        return migrated;
      });
    });
  }

  function read() {
    return transact("readonly", (store, handle) => handle(store.get(currentKey), (data) => data));
  }

  function update(change) {
    return transact("readwrite", (store, handle) => {
      handle(store.get(currentKey), (data) => {
        change(data);
        store.put(data, currentKey);
        return data;
      });
    });
  }

  function hasPrevious() {
    return transact("readonly", (store, handle) => handle(store.getKey(previousKey), Boolean));
  }

  function restore(incoming) {
    if (!validWorkspace(incoming)) return Promise.reject(new Error("Invalid workspace"));
    return transact("readwrite", (store, handle) => {
      handle(store.get(currentKey), (data) => {
        store.put(data, previousKey);
        store.put(incoming, currentKey);
        return incoming;
      });
    });
  }

  function revert() {
    return transact("readwrite", (store, handle) => {
      handle(store.get(previousKey), (previous) => {
        if (!previous) throw new Error("No prior workspace");
        handle(store.get(currentKey), (current) => {
          store.put(current, previousKey);
          store.put(previous, currentKey);
          return previous;
        });
      });
    });
  }

  async function reset() {
    const empty = { projects: [], tasks: [] };
    const data = await transact("readwrite", (store, handle) => {
      handle(store.clear(), () => {
        store.put(empty, currentKey);
        return empty;
      });
    });
    try {
      localStorage.removeItem(legacyKey);
    } catch {
      // The empty workspace is already committed.
    }
    return data;
  }

  function zipLibrary() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!zipLoading) {
      zipLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "./vendor/jszip.min.js?v=13";
        script.onload = () => resolve(window.JSZip);
        script.onerror = () => {
          zipLoading = undefined;
          script.remove();
          reject(new Error("Cannot load ZIP library"));
        };
        document.head.append(script);
      });
    }
    return zipLoading;
  }

  const attachmentPath = (project, doc) => "pdf/" + project.id + "/" + doc.id + ".pdf";

  async function exportArchive(workspace) {
    const JSZip = await zipLibrary();
    const zip = new JSZip();
    const data = {
      ...workspace,
      projects: workspace.projects.map((project) => ({
        ...project,
        documents: project.documents.map((doc) => {
          if (!doc.pdf) return doc;
          zip.file(attachmentPath(project, doc), doc.pdf, { createFolders: false });
          const { pdf, ...metadata } = doc;
          return { ...metadata, pdfSize: pdf.size };
        })
      }))
    };
    zip.file("backup.json", JSON.stringify({ app: appName, version, exportedAt: new Date().toISOString(), data }, null, 2));
    return zip.generateAsync({ type: "blob", compression: "STORE", mimeType: "application/zip" });
  }

  function parseManifest(text, fromArchive = false) {
    const backup = JSON.parse(text);
    const formats = fromArchive ? [version] : [1, 2, 3];
    if (backup?.app !== appName || !formats.includes(backup.version) || !validWorkspace(backup.data, fromArchive)) {
      throw new Error("Invalid backup");
    }
    return backup.data;
  }

  function exportBackup(data) {
    if (data.projects.some((project) => project.documents.some((doc) => doc.pdf))) {
      throw new Error("PDF attachments require ZIP backup");
    }
    return JSON.stringify({ app: appName, version: 3, exportedAt: new Date().toISOString(), data }, null, 2);
  }

  async function readBackup(file) {
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
      return parseManifest(await file.text());
    }

    const JSZip = await zipLibrary();
    const zip = await JSZip.loadAsync(file, { checkCRC32: true });
    const manifest = zip.file("backup.json");
    if (!manifest) throw new Error("Missing backup manifest");
    const data = parseManifest(await manifest.async("string"), true);
    const expected = new Set(["backup.json"]);
    for (const project of data.projects) {
      for (let index = 0; index < project.documents.length; index += 1) {
        const document = project.documents[index];
        if (document.url) continue;
        const path = attachmentPath(project, document);
        const entry = zip.file(path);
        expected.add(path);
        if (!entry || document.pdfSize > file.size) throw new Error("Missing PDF");
        const blob = await entry.async("blob");
        if (document.pdfSize !== blob.size) throw new Error("Incorrect PDF size");
        const { pdfSize, ...metadata } = document;
        project.documents[index] = { ...metadata, pdf: await readPdf(blob) };
      }
    }
    if (Object.values(zip.files).some((entry) => !entry.dir && !expected.has(entry.name))) {
      throw new Error("Unexpected backup file");
    }
    return data;
  }

  return {
    revision: 13, stages, createId, validDate, validLink, readPdf, validMoney, validTask, toSatang,
    advanceStage, paidAmount, load, read, update, hasPrevious, restore, revert, reset, exportArchive, readBackup, exportBackup, parseBackup: parseManifest
  };
})();

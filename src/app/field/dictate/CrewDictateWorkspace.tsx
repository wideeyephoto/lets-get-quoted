'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './crew-dictate.module.css';

export type CrewDictatedItem = {
  id: string;
  type: 'voice' | 'sms' | 'receipt';
  time: string;
  rawText: string;
  audioDuration?: string;
  jobRef: string;
  tasks: {
    id: string;
    text: string;
    category: 'task' | 'material' | 'milestone';
    done: boolean;
  }[];
};

const SAMPLE_CREW_INPUTS: CrewDictatedItem[] = [
  {
    id: 'input-1',
    type: 'voice',
    time: '2:15 PM · Today',
    audioDuration: '0:11',
    jobRef: 'J-104 (Miller - 124 Main)',
    rawText:
      '“Rough plumbing passed inspection at 124 Main. Need drywall crew Thursday 8am. Faltan 2 cajas de tornillos.”',
    tasks: [
      {
        id: 't-1',
        text: 'Milestone: Rough-In Inspection Passed & Signed Off',
        category: 'milestone',
        done: true,
      },
      {
        id: 't-2',
        text: 'Schedule: Drywall crew arrival Thursday 8:00 AM',
        category: 'task',
        done: true,
      },
      {
        id: 't-3',
        text: 'Material: Pick up 2 boxes drywall screws from supply house',
        category: 'material',
        done: true,
      },
    ],
  },
  {
    id: 'input-2',
    type: 'sms',
    time: '11:30 AM · Today',
    jobRef: 'J-92 (Johnson - 88 Birch)',
    rawText:
      'Johnson punch list: 1) caulked exterior siding trim 2) replaced hallway GFCI cover plate 3) touched up baseboard paint.',
    tasks: [
      {
        id: 't-4',
        text: 'Caulk exterior siding trim joints',
        category: 'task',
        done: true,
      },
      {
        id: 't-5',
        text: 'Replace hallway GFCI cover plate',
        category: 'task',
        done: true,
      },
      {
        id: 't-6',
        text: 'Touch up baseboard paint in hallway',
        category: 'task',
        done: true,
      },
    ],
  },
];

interface CrewDictateWorkspaceProps {
  crewName: string;
  businessName: string;
  fieldPhoneNumber: string;
  crewPhone: string | null;
}

export default function CrewDictateWorkspace({
  crewName: _crewName,
  businessName,
  fieldPhoneNumber,
  crewPhone,
}: CrewDictateWorkspaceProps) {
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const [items, setItems] = useState<CrewDictatedItem[]>(SAMPLE_CREW_INPUTS);
  const [eodSubmitted, setEodSubmitted] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [quickNote, setQuickNote] = useState<string>('');

  function toggleTask(inputId: string, taskId: string) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== inputId) return item;
        return {
          ...item,
          tasks: item.tasks.map((task) => {
            if (task.id !== taskId) return task;
            return { ...task, done: !task.done };
          }),
        };
      })
    );
  }

  function handleAddQuickNote() {
    if (!quickNote.trim()) return;

    const newItem: CrewDictatedItem = {
      id: `input-${Date.now()}`,
      type: 'sms',
      time: 'Just now (EOD Note)',
      jobRef: 'Today’s Route Wrap-Up',
      rawText: `“${quickNote}”`,
      tasks: [
        {
          id: `t-${Date.now()}`,
          text: quickNote,
          category: 'task',
          done: true,
        },
      ],
    };

    setItems([newItem, ...items]);
    setQuickNote('');
    setToast(
      lang === 'es'
        ? '✓ Nota de fin de jornada agregada y lista para enviar'
        : '✓ End-of-day note added and queued for submission'
    );
    setTimeout(() => setToast(null), 3500);
  }

  function handleSubmitEOD() {
    setEodSubmitted(true);
    setToast(
      lang === 'es'
        ? '🚀 ¡Resumen de fin de jornada enviado al panel de la oficina!'
        : '🚀 End-of-day wrap-up synced to office dashboard!'
    );
    setTimeout(() => setToast(null), 4500);
  }

  const isEs = lang === 'es';

  return (
    <div className={styles.container}>
      {/* Language Switcher Bar */}
      <div className={styles.langBar}>
        <span>
          {isEs ? '🌐 Idioma de la aplicación' : '🌐 Field Language:'}{' '}
          <strong>{isEs ? 'Español' : 'English'}</strong>
        </span>
        <button
          type="button"
          onClick={() => setLang(isEs ? 'en' : 'es')}
          className={styles.langToggleBtn}
        >
          {isEs ? 'Switch to English' : 'Cambiar a Español'}
        </button>
      </div>

      {/* Hotline Action Card */}
      <div className={styles.hotlineCard}>
        <div className={styles.hotlineHead}>
          <span className={styles.hotlineBadge}>
            {isEs ? 'Línea de Dictado de Campo' : 'Field Dictation Hotline'}
          </span>
          <span className={styles.hotlineStatus}>
            ● {isEs ? 'Línea Activa' : 'Ingress Active'}
          </span>
        </div>

        <div className={styles.hotlineMain}>
          <h2 className={styles.hotlineTitle}>
            {isEs ? 'Dicta notas o envía fotos por mensaje' : 'Text or Voice Memo from the Truck'}
          </h2>
          <div className={styles.hotlineNumber}>{fieldPhoneNumber}</div>
          <p className={styles.hotlineSub}>
            {isEs
              ? `Envía notas de voz o mensajes de texto a este número desde tu teléfono (${crewPhone || 'móvil registrado'}). Gemini AI transcribe y actualiza las tareas automáticamente.`
              : `Send voice memos, texts, or receipt photos to this number from your phone (${crewPhone || 'registered mobile'}). Gemini AI transcribes and logs tasks automatically.`}
          </p>
        </div>

        <div className={styles.hotlineActionsGrid}>
          <a href={`sms:${fieldPhoneNumber.replace(/[^\d+]/g, '')}`} className={styles.actionBtnSms}>
            💬 {isEs ? 'Enviar Mensaje / Nota' : 'Text Field Hotline'}
          </a>
          <a
            href={`data:text/vcard;charset=utf-8,${encodeURIComponent(
              `BEGIN:VCARD\nVERSION:3.0\nFN:${businessName} Field Hotline\nTEL;TYPE=CELL:${fieldPhoneNumber}\nNOTE:Text-to-Job Field Ingest\nEND:VCARD`
            )}`}
            download="field-hotline.vcf"
            className={styles.actionBtnVcard}
          >
            📱 {isEs ? 'Guardar Contacto' : 'Save Contact (.vcf)'}
          </a>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && <div className={styles.toastSuccess}>{toast}</div>}

      {/* Today's Dictated Inputs Feed & End-of-Day Review */}
      <div className={styles.eodSection}>
        <div className={styles.eodHead}>
          <h3 className={styles.eodTitle}>
            {isEs ? 'Tus notas y tareas dictadas de hoy' : 'Today’s Dictated Notes & Tasks'}
          </h3>
          <span className={styles.eodBadge}>
            {items.length} {isEs ? 'Entradas' : 'Entries'}
          </span>
        </div>

        <p style={{ fontSize: '12.5px', color: '#a7bcc8', margin: 0 }}>
          {isEs
            ? 'Revisa y desmarca cualquier elemento antes de enviar el resumen de fin de jornada.'
            : 'Review and check/uncheck tasks before submitting your end-of-day wrap-up to the office.'}
        </p>

        {/* List of Today's Inputs */}
        <div className={styles.feedList}>
          {items.map((item) => (
            <div key={item.id} className={styles.feedItemCard}>
              <div className={styles.feedItemHead}>
                <span className={styles.feedItemType}>
                  {item.type === 'voice' ? '🎙️ ' + (isEs ? 'Nota de Voz' : 'Voice Memo') : '💬 SMS'} &middot;{' '}
                  <strong style={{ color: '#ff8e42' }}>{item.jobRef}</strong>
                </span>
                <span className={styles.feedItemTime}>{item.time}</span>
              </div>

              <p className={styles.feedItemText}>{item.rawText}</p>

              {/* Tasks / Extracted Items Checklist */}
              <div className={styles.extractedPills}>
                <span style={{ fontSize: '10.5px', color: '#7da0b3', fontWeight: 800, textTransform: 'uppercase' }}>
                  {isEs ? 'Tareas y elementos extraídos:' : 'Extracted Tasks & Scope:'}
                </span>

                {item.tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(item.id, task.id)}
                    className={styles.taskCheckboxRow}
                  >
                    <div
                      className={`${styles.taskCheckbox} ${
                        !task.done ? styles.taskCheckboxUnchecked : ''
                      }`}
                    >
                      {task.done ? '✓' : ''}
                    </div>
                    <div className={styles.taskMeta}>
                      <span
                        className={styles.taskTitle}
                        style={{
                          textDecoration: task.done ? 'none' : 'line-through',
                          opacity: task.done ? 1 : 0.5,
                        }}
                      >
                        {task.text}
                      </span>
                      <span className={styles.taskDetail}>
                        {task.category === 'milestone'
                          ? isEs ? 'Hito del proyecto' : 'Project Milestone'
                          : task.category === 'material'
                          ? isEs ? 'Materiales / Suministros' : 'Materials / Supplies'
                          : isEs ? 'Tarea de campo' : 'Field Checklist Task'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Add Extra EOD Audio / Text Note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 800, color: '#f5f0e7' }}>
            {isEs ? '+ Agregar nota adicional de fin de día:' : '+ Add additional end-of-day note:'}
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder={
                isEs
                  ? 'ej. Trailer cerrado con llave en el sitio, trabajo terminado al 100%'
                  : 'e.g. Left tool trailer locked on site, 100% complete on rough wiring'
              }
              style={{
                flexGrow: 1,
                background: 'rgba(4, 11, 18, 0.9)',
                border: '1px solid rgba(174, 199, 211, 0.2)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleAddQuickNote}
              style={{
                background: '#ff6a24',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {isEs ? 'Agregar' : 'Add Note'}
            </button>
          </div>
        </div>

        {/* Submit End-of-Day Wrap-Up Action */}
        <button
          type="button"
          onClick={handleSubmitEOD}
          className={styles.eodSubmitBtn}
        >
          {eodSubmitted ? '✓ ' + (isEs ? 'Resumen de Fin de Día Enviado' : 'EOD Wrap-Up Synced to Office') : '🚀 ' + (isEs ? 'Confirmar y Enviar Resumen de Fin de Día' : 'Submit End-of-Day Wrap-Up')}
        </button>
      </div>

      {/* Back to Jobs Link */}
      <div style={{ textAlign: 'center', marginTop: '8px' }}>
        <Link href="/field" style={{ color: '#8fa6b5', fontSize: '13px', textDecoration: 'none' }}>
          ‹ {isEs ? 'Volver a Mis Trabajos' : 'Back to My Route & Jobs'}
        </Link>
      </div>
    </div>
  );
}

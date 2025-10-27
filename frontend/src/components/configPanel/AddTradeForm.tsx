import React from 'react';

interface AddTradeFormProps {
  get: string;
  setGet: (v: string) => void;
  pay: string;
  setPay: (v: string) => void;
  saving: boolean;
  addPair: (get: string, pay: string, setCfg: any, setGet: any, setPay: any, setSaving: any, onPairAdded: any) => void;
  setCfg: any;
  onPairAdded: any;
}

const AddTradeForm: React.FC<AddTradeFormProps> = ({ get, setGet, pay, setPay, saving, addPair, setCfg, onPairAdded }) => (
  <div>
    <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
      Add Trade
    </label>
    <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
      <input 
        placeholder="Want (e.g. divine)" 
        value={get} 
        onChange={e => setGet(e.target.value)}
        disabled={saving}
        style={{ fontSize: '13px', padding: '6px 8px' }}
      />
      <input 
        placeholder="Pay (e.g. chaos)" 
        value={pay} 
        onChange={e => setPay(e.target.value)}
        disabled={saving}
        style={{ fontSize: '13px', padding: '6px 8px' }}
      />
      <button 
        className="btn primary" 
        onClick={() => addPair(get, pay, setCfg, setGet, setPay, saving, onPairAdded)} 
        disabled={saving || !get.trim() || !pay.trim()}
        style={{width: '100%', fontSize: '13px', padding: '8px'}}
      >
        {saving ? 'Adding...' : '+ Add'}
      </button>
    </div>
  </div>
);

export default AddTradeForm;

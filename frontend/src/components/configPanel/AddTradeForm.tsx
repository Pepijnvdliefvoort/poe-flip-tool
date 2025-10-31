import React from 'react';

interface AddTradeFormProps {
  get: string;
  setGet: (v: string) => void;
  pay: string;
  setPay: (v: string) => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  addPair: (get: string, pay: string, setCfg: any, setGet: any, setPay: any, setSaving: any, onPairAdded: any) => void;
  setCfg: any;
  onPairAdded: any;
}

const AddTradeForm: React.FC<AddTradeFormProps> = ({ get, setGet, pay, setPay, saving, setSaving, addPair, setCfg, onPairAdded }) => (
  <div>
    <span className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
      Add Trade
    </span>
    <form
      onSubmit={e => {
        e.preventDefault();
        if (!saving && get.trim() && pay.trim()) {
          addPair(get, pay, setCfg, setGet, setPay, setSaving, onPairAdded);
        }
      }}
      style={{display: 'flex', flexDirection: 'column', gap: 6}}
      autoComplete="off"
    >
      <input
        id="addtrade-pay"
        name="pay"
        placeholder="Pay (e.g. chaos)"
        value={pay}
        onChange={e => setPay(e.target.value)}
        disabled={saving}
        style={{ fontSize: '13px', padding: '6px 8px' }}
      />
      <input
        id="addtrade-get"
        name="get"
        placeholder="Get (e.g. divine)"
        value={get}
        onChange={e => setGet(e.target.value)}
        disabled={saving}
        style={{ fontSize: '13px', padding: '6px 8px' }}
      />
      <button
        className="btn primary"
        type="submit"
        disabled={saving || !get.trim() || !pay.trim()}
        style={{width: '100%', fontSize: '13px', padding: '8px'}}
      >
        {saving ? 'Adding...' : '+ Add'}
      </button>
    </form>
  </div>
);

export default AddTradeForm;

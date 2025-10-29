import React from 'react';

interface AccountNameInputProps {
  accountNameDraft: string;
  setAccountNameDraft: (v: string) => void;
  accountNameSaving: boolean;
}

const AccountNameInput: React.FC<AccountNameInputProps> = ({ accountNameDraft, setAccountNameDraft, accountNameSaving }) => (
  <div style={{ marginBottom: 16 }}>
    <label
      className="muted"
      htmlFor="account-name-input"
      style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}
    >
      Account Name (Highlight)
    </label>
    <input
      id="account-name-input"
      type="text"
      value={accountNameDraft}
      onChange={e => setAccountNameDraft(e.target.value)}
      placeholder="e.g. iNeoxiz#3422"
      style={{ fontSize: '13px', padding: '6px 8px', width: '100%', boxSizing: 'border-box' }}
    />
    <div className="muted" style={{ fontSize: '11px', marginTop: '4px' }}>
      {accountNameSaving ? 'Saving…' : 'Trades matching this PoE account will be highlighted.'}
    </div>
  </div>
);

export default AccountNameInput;

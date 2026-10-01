import {useState} from 'react';
import {expect,it} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Modal} from '../../src/components/shared/Modal.js';
function Example(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open review</button>{open&&<Modal title="Review" description="Inspect the action." onClose={()=>setOpen(false)}><button>First action</button></Modal>}</>}
it('returns keyboard focus to the external opener after Escape closes the dialog',async()=>{
 const user=userEvent.setup();render(<Example/>);const opener=screen.getByRole('button',{name:'Open review'});
 await user.click(opener);expect(screen.getByRole('dialog')).toBeVisible();await user.keyboard('{Escape}');
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());await waitFor(()=>expect(opener).toHaveFocus());
});

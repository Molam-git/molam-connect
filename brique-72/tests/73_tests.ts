describe('dev console', ()=>{
  it('creates key and allows sandbox simulate', async ()=>{
    const app = await createApp(...);
    const key = await createKey(app.id, ['payments:write'],'test');
    const resp = await simulateEvent(app.id, 'payment.succeeded', {...});
    expect(resp.ok).toBe(true);
    // assert webhook delivery log exists
  });
});

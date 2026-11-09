import 'dotenv/config';
import { test, expect, type Browser, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { sql } from '@ecogrowth/db';
import { disposablePostgres } from '../helpers/disposable-postgres';
import { testServer } from '../helpers/test-server';
import { setTimeout as delay } from 'node:timers/promises';
import { labels } from '@ecogrowth/domain/navigation';
import type { Resource } from '@ecogrowth/contracts';

// Real clients + API + disposable PostgreSQL. No route mocks and no developer pilot mutations.
const origin = 'http://127.0.0.1:5177';
let fixture: Awaited<ReturnType<typeof disposablePostgres>>;
let api: ReturnType<typeof testServer>, web: ReturnType<typeof testServer>;
const contexts: BrowserContext[] = [];

test.describe('isolated end-to-end operational pilot', () => {
  test.setTimeout(420000);
  test.beforeAll(async () => {
    test.setTimeout(240000);
    fixture = await disposablePostgres();
    api = testServer(['--import', 'tsx', 'apps/api/src/dev.ts'], {
      DATABASE_URL: fixture.url, PORT: '3107', BETTER_AUTH_URL: 'http://127.0.0.1:3107', ALLOWED_ORIGINS: origin
    });
    await api.ready('http://127.0.0.1:3107/api/v1/health');
    web = testServer(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5177', '--strictPort'], {
      API_PROXY_TARGET: 'http://127.0.0.1:3107', ECOGROWTH_VITE_CACHE_DIR: '../../.local/vite-workflow-cache'
    }, '../../apps/web/');
    await web.ready(origin);
  });
  test.afterAll(async () => {
    await Promise.all(contexts.map(context => context.close()));
    await web?.stop();
    await api?.stop();
    await fixture?.cleanup();
  });
  test.afterEach(async()=>{await Promise.all(contexts.splice(0).map(context=>context.close()));});

  async function login(browser: Browser, identity: string) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);
    await page.bringToFront();
    await page.goto(origin + '/login',{waitUntil:'domcontentloaded'});
    // Cold dev transforms are setup work, not a production performance measurement. Keep
    // role contexts separate and wait for the login route instead of racing its lazy chunk.
    await expect(page.getByRole('heading',{name:'Welcome back.',exact:true})).toBeVisible({timeout:60000});
    await page.getByLabel('Email address').fill(identity + '@demo.ecogrowth.test');
    await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_SEED_PASSWORD!);
    for(let attempt=0;attempt<4;attempt++){
      const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/v1/auth/sign-in/identifier')&&response.request().method()==='POST');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      const response=await responsePromise;
      if(response.status()!==429){expect(response.status()).toBe(200);break;}
      if(attempt===3)throw new Error('Login remained rate-limited after bounded, server-directed retries.');
      // Several role sessions share one loopback IP. Honour the limiter rather than disable it.
      const seconds=Math.min(60,Math.max(1,Number(response.headers()['retry-after'])||10));
      await delay((seconds+1)*1000);
    }
    await expect(page.getByRole('heading', { name: /A clearer view/ })).toBeVisible();
    return page;
  }
  async function section(page: Page, resource: Resource) {
    await page.bringToFront();
    // Exercise actual sidebar navigation and preserve the authenticated React client.
    // Reloading the entire dev module graph at every step tests Vite cold transforms,
    // not how an operator navigates the service.
    await page.locator(`aside.sidebar a[href="/app/${resource}"]`).click();
    await expect(page).toHaveURL(origin+'/app/'+resource);
    await expect(page.getByRole('heading', { level: 1, name:labels[resource],exact:true })).toBeVisible();
  }
  const rowWith = (page: Page, reference: string) => page.getByRole('row').filter({ hasText: reference });
  async function action(page: Page, row: Locator | undefined, name: string) {
    await page.bringToFront();
    await (row || page).getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }
  async function save(dialog: Locator) {
    await dialog.getByRole('button', { name: 'Confirm & save', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  test('administrator provisions a username, forces password change and updates live user permissions',async({browser})=>{
    const admin=await login(browser,'admin');await section(admin,'users');
    await admin.getByRole('button',{name:'Create user',exact:true}).click();
    await admin.getByLabel('Full name',{exact:true}).fill('Browser staff fixture');
    await admin.getByLabel('Email address',{exact:true}).fill('browser-staff@example.test');
    await admin.getByLabel('Login username',{exact:true}).fill('browser.staff');
    await admin.getByLabel('Temporary password',{exact:true}).fill('Browser-temporary-only-2026!');
    const organization=(await fixture.pool.query("SELECT o.name FROM organizations o JOIN memberships m ON m.organization_id=o.id JOIN \"user\" u ON u.id=m.user_id WHERE u.email='customer1@demo.ecogrowth.test' LIMIT 1")).rows[0];
    await admin.getByLabel('Organization',{exact:true}).selectOption({label:organization.name});
    await admin.getByLabel('Reason for creating this account').fill('Isolated browser account provisioning test.');
    await admin.getByRole('button',{name:'Create account and show credentials',exact:true}).click();
    await expect(admin.getByRole('region',{name:'New account credentials'})).toContainText('browser.staff');
    await admin.getByRole('button',{name:/I have shared the credentials securely/}).click();
    const context=await browser.newContext();contexts.push(context);const staff=await context.newPage();
    await staff.goto(origin+'/login');await staff.getByLabel('Email address or username',{exact:true}).fill('browser.staff');await staff.getByLabel('Password',{exact:true}).fill('Browser-temporary-only-2026!');await staff.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(staff.getByRole('heading',{name:'Set your own password',exact:true})).toBeVisible();
    await staff.getByLabel('Current temporary password',{exact:true}).fill('Browser-temporary-only-2026!');
    await staff.getByLabel('New private password',{exact:true}).fill('Browser-private-only-2026!');await staff.getByLabel('Confirm new password',{exact:true}).fill('Browser-private-only-2026!');
    await staff.getByRole('button',{name:'Save password and sign in again',exact:true}).click();await expect(staff.getByRole('heading',{name:'Welcome back.',exact:true})).toBeVisible();
    await staff.getByLabel('Email address or username',{exact:true}).fill('browser.staff');await staff.getByLabel('Password',{exact:true}).fill('Browser-private-only-2026!');await staff.getByRole('button',{name:'Sign in',exact:true}).click();await expect(staff.getByRole('heading',{name:/A clearer view/})).toBeVisible();
    await expect(staff.locator('aside.sidebar a[href="/app/users"]')).toHaveCount(0);
    await section(staff,'complaints');
    await admin.getByLabel('Search users by name, email or username').fill('browser.staff');
    await admin.getByRole('button',{name:'Edit role & permissions',exact:true}).click();
    await admin.locator('.permission-grid>div').filter({hasText:'Complaints'}).getByRole('checkbox',{name:'View',exact:true}).uncheck();
    await admin.getByLabel('Reason for access change').fill('Remove complaint access during live browser session.');
    await admin.getByRole('button',{name:'Save organization access',exact:true}).click();
    await expect(staff.locator('aside.sidebar a[href="/app/complaints"]')).toHaveCount(0,{timeout:20000});
    await expect(staff.getByRole('heading',{name:'Access not permitted',exact:true})).toBeVisible();
    await admin.getByRole('button',{name:'Disable account',exact:true}).click();await admin.getByLabel('Reason',{exact:true}).fill('Disable owned browser fixture account.');await admin.getByRole('button',{name:'Confirm disable',exact:true}).click();
    await expect(staff.getByRole('heading',{name:'Welcome back.',exact:true})).toBeVisible({timeout:20000});
  });
  test('request → assess → accept → schedule → collect → independently receive → reconcile → invoice → confirm → resolve', async ({ browser }) => {
    const visitorContext=await browser.newContext();contexts.push(visitorContext);
    const visitor=await visitorContext.newPage();await visitor.goto(origin+'/quote-request');
    await visitor.getByLabel('Your full name').fill('Anonymous assessment fixture');
    await visitor.getByLabel('Email address',{exact:true}).fill('public-browser@example.test');
    await visitor.getByLabel('Business / organization name',{exact:true}).fill('Public fixture kitchen');
    await visitor.getByLabel('Site location & nearest landmark').fill('Isolated fictional landmark');
    await visitor.getByLabel('What support do you need?').selectOption('Site assessment & collection');
    await visitor.getByLabel('Tell us about your materials and current routine').fill('Automated isolated assessment request without an account.');
    await visitor.getByRole('checkbox').filter({visible:true}).first().check();
    await visitor.getByRole('button',{name:/Send assessment request/}).click();
    await expect(visitor.locator('.public-enquiry-form [data-form-status]')).toContainText('Request saved');
    const customer = await login(browser, 'customer1');
    const operations = await login(browser, 'operations');
    await section(operations,'enquiries');
    const lead=(await fixture.pool.query("SELECT reference FROM enquiries WHERE email='public-browser@example.test'")).rows[0];
    await operations.getByRole('button',{name:'Review '+lead.reference,exact:true}).click();
    await expect(operations.getByRole('region',{name:'Enquiry details'})).toContainText('Isolated fictional landmark');
    await operations.getByLabel('Follow-up status').selectOption('CONTACTED');
    await operations.getByLabel('Private follow-up notes').fill('Isolated automated callback recorded.');
    await operations.getByRole('button',{name:'Save follow-up',exact:true}).click();
    await expect.poll(async()=>(await fixture.pool.query("SELECT status FROM enquiries WHERE reference=$1",[lead.reference])).rows[0].status).toBe('CONTACTED');
    const collector = await login(browser, 'collector');
    const receiver = await login(browser, 'receiver');
    const finance = await login(browser, 'finance');
    const date = new Date().toISOString().slice(0, 10), weekday = new Date().getUTCDay();
    const business = 'Automated kitchen · Isolated test';

    await section(customer, 'sites');
    let dialog = await action(customer, undefined, 'Request assessment');
    await dialog.getByLabel('Business / site name').fill(business);
    await dialog.getByLabel('Business category').selectOption('RESTAURANT');
    await dialog.getByLabel('Location and landmark').fill('Fictional isolated-test landmark, Sinkor');
    await dialog.getByLabel('Decision-maker contact').fill('Automated fixture, not a real contact');
    await dialog.getByLabel('Operating weekdays (0 = Sunday)').fill('0,1,2,3,4,5,6');
    await dialog.getByLabel('Storage arrangements').fill('Covered source-separated test container');
    await dialog.getByLabel('Current waste service, handling and prior beneficial uses').fill('Isolated test baseline; current residual handling and beneficial uses unverified.');
    await dialog.getByLabel('Expected quantity per pickup (grams)').fill('12000');
    await dialog.getByLabel('Site is in the Sinkor pilot cluster').check();
    await save(dialog);
    const site = (await fixture.db.execute(sql`SELECT * FROM sites WHERE name=${business}`)).rows[0] as any;

    await section(operations, 'sites');
    dialog = await action(operations, rowWith(operations, business), 'Record assessment');
    await dialog.getByLabel('Assessment notes').fill('Automated qualification fixture; not an actual site visit.');
    await dialog.getByLabel('Qualified after assessment').check();
    await save(dialog);
    dialog = await action(operations, rowWith(operations, business), 'Issue quotation');
    await dialog.getByLabel('Currency', { exact: true }).selectOption('USD');
    await dialog.getByLabel('Monthly amount (minor units; 100 = 1 dollar)').fill('4000');
    await dialog.getByLabel('Collections per week').fill('2');
    await dialog.getByLabel('Quantity allowance (grams)').fill('100000');
    await dialog.getByLabel('Assumptions, tax treatment and quantity basis').fill('Automated demo pricing fixture; no tax configured; monthly service.');
    await dialog.getByLabel('Customer responsibilities').fill('Separate facility-approved materials; residual collection remains separate.');
    await dialog.getByLabel('Service window description / responsibilities').fill('08:00–12:00 in site timezone; fixture terms.');
    await dialog.getByLabel('Local window start (HH:mm)').fill('08:00');
    await dialog.getByLabel('Local window end (HH:mm; earlier time means overnight)').fill('12:00');
    await dialog.getByLabel('Terms version').fill('isolated-e2e-v1');
    await dialog.getByLabel('Valid until').fill(new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 16));
    await save(dialog);
    const quote = (await fixture.db.execute(sql`SELECT * FROM quotations WHERE site_id=${site.id}`)).rows[0] as any;

    await section(customer, 'quotations');
    dialog = await action(customer, rowWith(customer, quote.reference), 'Accept quoted terms');
    await save(dialog);
    expect((await fixture.db.execute(sql`SELECT snapshot FROM agreements WHERE quotation_id=${quote.id}`)).rows[0].snapshot).toMatchObject({ window_start_local: '08:00:00', schedule_timezone: 'Africa/Monrovia' });

    await section(operations, 'sites');
    dialog = await action(operations, rowWith(operations, business), 'Approve & activate site');
    await dialog.getByLabel('Who was trained').fill('Isolated test team');
    await dialog.getByLabel('Accepted-material guidance version').fill('demo-materials-v1');
    await dialog.getByLabel('Collection weekdays (0 = Sunday)').fill(`${weekday},${(weekday + 3) % 7}`);
    await dialog.getByLabel('Subscription start').fill(date);
    await save(dialog);

    await section(operations, 'schedules');
    dialog = await action(operations, undefined, 'Generate jobs');
    await dialog.getByLabel('First local service date').fill(date);
    await dialog.getByLabel('Last local service date').fill(date);
    await save(dialog);
    const job = (await fixture.db.execute(sql`SELECT * FROM job_occurrences WHERE site_id=${site.id}`)).rows[0] as any;
    const route = (await fixture.db.execute(sql`SELECT * FROM routes LIMIT 1`)).rows[0] as any;
    const person = (await fixture.db.execute(sql`SELECT id FROM "user" WHERE email='collector@demo.ecogrowth.test'`)).rows[0] as any;
    await section(operations, 'jobs');
    dialog = await action(operations, rowWith(operations, job.reference), 'Assign collection');
    await dialog.getByLabel('Authorized route UUID').fill(route.id);
    await dialog.getByLabel('Collector user ID').fill(person.id);
    await save(dialog);

    await section(collector, 'jobs');
    dialog = await action(collector, rowWith(collector, job.reference), 'Start journey');
    await dialog.getByLabel('Operational note').fill('Isolated test route started.');
    await save(dialog);
    dialog = await action(collector, rowWith(collector, job.reference), 'Record arrival');
    await dialog.getByLabel('Operational note').fill('Isolated test site arrival.');
    await save(dialog);
    dialog = await action(collector, rowWith(collector, job.reference), 'Record weighed pickup');
    await dialog.getByLabel('Gross weight (grams)').fill('14000');
    await dialog.getByLabel('Tare weight (grams)').fill('2000');
    await dialog.getByLabel('Net weight (grams)').fill('12000');
    await dialog.getByLabel('Measurement basis').selectOption('MEASURED');
    await dialog.getByLabel('Scale / estimation method').fill('Isolated test platform scale fixture');
    await dialog.getByLabel('Approved material').selectOption('FOOD_SCRAPS');
    await save(dialog);
    const collection = (await fixture.db.execute(sql`SELECT * FROM collections WHERE job_id=${job.id}`)).rows[0] as any;

    await section(collector, 'collections');
    const collectionRow = collector.getByRole('row').filter({ has: collector.locator(`code[title="${job.id}"]`) });
    dialog = await action(collector, collectionRow, 'Dispatch to facility');
    await dialog.getByLabel('Destination facility UUID').fill(route.facility_id);
    await save(dialog);
    const manifest = (await fixture.db.execute(sql`SELECT m.* FROM manifests m JOIN delivery_allocations da ON da.manifest_id=m.id WHERE da.collection_id=${collection.id}`)).rows[0] as any;
    await section(collector, 'manifests');
    dialog = await action(collector, rowWith(collector, manifest.reference), 'Record delivery handover');
    await save(dialog);

    await section(receiver, 'manifests');
    dialog = await action(receiver, rowWith(receiver, manifest.reference), 'Independently record receiving');
    await dialog.getByLabel('Measured received mass (grams)').fill('11000');
    await dialog.getByLabel('Accepted mass (grams)').fill('10000');
    await dialog.getByLabel('Rejected mass (grams)').fill('1000');
    await dialog.getByLabel('Measurement method').fill('Independent receiving scale; isolated test fixture');
    await dialog.getByLabel('Receiving proof reference (submitted, not verified)').fill('ISOLATED-TEST-RECEIVING-REFERENCE');
    await save(dialog);
    const receiving = (await fixture.db.execute(sql`SELECT * FROM receiving_records WHERE manifest_id=${manifest.id}`)).rows[0] as any;
    expect(Number(receiving.received_grams)).toBe(11000);
    expect(Number(receiving.accepted_grams)).toBe(10000);
    expect(Number(receiving.rejected_grams)).toBe(1000);
    expect(Number((await fixture.db.execute(sql`SELECT net_grams FROM collections WHERE id=${collection.id}`)).rows[0].net_grams)).toBe(12000);
    await section(operations, 'reconciliation');
    const reconciliationRow = operations.getByRole('row').filter({ has: operations.locator(`code[title="${manifest.id}"]`) });
    dialog = await action(operations, reconciliationRow, 'Review reconciliation');
    await dialog.getByLabel('Evidence reviewed, discrepancy explanation and limitations').fill('Isolated independent review: 1 kg source/receiving difference retained; reference is a fixture, not verified treatment.');
    await save(dialog);
    const residual = (await fixture.db.execute(sql`SELECT * FROM residuals WHERE receiving_id=${receiving.id}`)).rows[0] as any;
    expect(residual.status).toBe('DESTINATION_PENDING');

    const subscription = (await fixture.db.execute(sql`SELECT * FROM subscriptions WHERE site_id=${site.id}`)).rows[0] as any;
    await section(finance, 'subscriptions');
    const subscriptionRow = finance.getByRole('row').filter({ has: finance.locator(`code[title="${site.id}"]`) });
    dialog = await action(finance, subscriptionRow, 'Issue service invoice');
    await dialog.getByLabel('Service period end').fill(new Date(Date.now() + 86400000 * 29).toISOString().slice(0, 10));
    await dialog.getByLabel('Payment due date').fill(new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10));
    await save(dialog);
    const invoice = (await fixture.db.execute(sql`SELECT * FROM invoices WHERE agreement_id=${subscription.agreement_id}`)).rows[0] as any;
    await section(customer, 'invoices');
    dialog = await action(customer, rowWith(customer, invoice.reference), 'Submit payment reference');
    const paymentReference = 'ISOLATED-E2E-' + job.reference;
    await dialog.getByLabel('Payment reference').fill(paymentReference);
    await save(dialog);
    expect(Number((await fixture.db.execute(sql`SELECT paid_minor FROM invoices WHERE id=${invoice.id}`)).rows[0].paid_minor)).toBe(0);
    await section(finance, 'payments');
    dialog = await action(finance, rowWith(finance, paymentReference), 'Review payment evidence');
    await dialog.getByLabel('Funds independently confirmed (unchecked = reject)').check();
    await dialog.getByLabel('Review basis / settlement reference').fill('ISOLATED TEST settled-funds fixture only; no actual funds.');
    await save(dialog);
    expect((await fixture.db.execute(sql`SELECT status,paid_minor FROM invoices WHERE id=${invoice.id}`)).rows[0]).toMatchObject({ status: 'PAID', paid_minor: '4000' });

    await section(customer, 'complaints');
    dialog = await action(customer, undefined, 'New complaint');
    await dialog.getByLabel('Site UUID').fill(site.id);
    await dialog.getByLabel('Subject', { exact: true }).fill('Isolated collection follow-up');
    await dialog.getByLabel('What happened?').fill('Please explain the independently recorded receiving difference in this isolated test.');
    await save(dialog);
    await section(operations, 'complaints');
    dialog = await action(operations, rowWith(operations, 'Isolated collection follow-up'), 'Resolve complaint');
    await dialog.getByLabel('Resolution and customer follow-up').fill('Difference explained; original source and receiving values preserved. No treatment claim made.');
    await save(dialog);
    expect((await fixture.db.execute(sql`SELECT status FROM complaints WHERE site_id=${site.id}`)).rows[0].status).toBe('RESOLVED');
  });
});

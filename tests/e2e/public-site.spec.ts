import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('redesigned public pages, three-slide controls and mobile navigation',async({page})=>{
 test.setTimeout(180000);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/Less waste/})).toBeVisible();
 const carousel=page.getByRole('region',{name:'EcoGrowth service illustrations'});
 await expect(carousel.getByRole('img')).toHaveCount(1);
 await carousel.getByRole('button',{name:/Show slide 2/}).click();
 await expect(carousel.getByRole('img',{name:/collection crew/})).toBeVisible();
 await expect(carousel.getByRole('button',{name:'Play slideshow'})).toBeVisible();
 for(const width of [320,375,768,1280,1920]){
  await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:375,height:900});
 await page.locator('.site-mobile-menu summary').click();
 await page.getByRole('navigation',{name:'Mobile public navigation'}).getByRole('link',{name:'Services',exact:true}).click();
 await expect(page.getByRole('heading',{name:'A practical plan for your organics.'})).toBeVisible();
 await expect(page.getByRole('main').getByRole('img')).toHaveCount(1);
 await page.goto('/quote-request');
 await expect(page.getByRole('heading',{name:'Tell us about your site.'})).toBeVisible();
 await expect(page.getByLabel('Your full name')).toBeVisible();
 await expect(page.getByRole('button',{name:/Send assessment request/})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['critical','serious'].includes(v.impact||''))).toEqual([]);
 for(const path of ['/contact','/team','/accepted-materials','/for-businesses','/for-partners','/service-areas','/privacy','/terms']){
  await page.goto(path);await expect(page.getByRole('main').getByRole('heading',{level:1})).toBeVisible();
  await expect(page.getByRole('main').getByRole('img').first()).toBeVisible();
 }
});

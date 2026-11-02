import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Composer,ruleAmountError} from '../../src/web/Composer';
import {compileDemoEvents} from '../../src/domain/demo';

describe('Rule amount field validation',()=>{
 it('explains an inverted range and accepts equal or increasing bounds',()=>{
  expect(ruleAmountError('5000000','4000000')).toContain('Maximum amount must be at least the minimum amount');
  expect(ruleAmountError('5000000','5000000')).toBeNull();
  expect(ruleAmountError('5000000','30000000')).toBeNull();
 });
 it('compares exact integers beyond Number precision',()=>{
  expect(ruleAmountError('9007199254740993','9007199254740992')).not.toBeNull();
  expect(ruleAmountError('9007199254740992','9007199254740993')).toBeNull();
 });
 it.each(['','-1','1.5','1e6',' 5','05'])('rejects malformed atomic input %j without throwing',value=>{
  expect(ruleAmountError(value,'5000000')).toContain('whole atomic units');
  expect(ruleAmountError('5000000',value)).toContain('whole atomic units');
 });
 it('renders an accessible inline explanation and disabled confirmation, without crashing on edit drafts',()=>{
  for(const maximum of ['4000000','1.5','']){
   const event=structuredClone(compileDemoEvents()[3]!);
   (event.payload.rule as any).scope.maxAmountAtomic=maximum;
   const html=renderToStaticMarkup(React.createElement(Composer,{event,busy:false,onSubmit:()=>{throw Error('Must not submit')}}));
   expect(html).toContain('role="alert"');
   expect(html).toContain('aria-invalid="true"');
   expect(html).toContain('aria-describedby=');
   expect(html).toMatch(/<button class="primary" disabled="">Confirm this rule<\/button>/);
  }
 });
});

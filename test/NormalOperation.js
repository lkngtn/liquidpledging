const LiquidPledging = artifacts.require("LiquidPledgingMock");
const Vault = artifacts.require("Vault");
const assertFail = require("./helpers/assertFail");

const getNote = async (liquidPledging, idNote) => {
    const note = {
        delegates: [],
    };
    const res = await liquidPledging.getNote(idNote);
    note.amount = res[0];
    note.owner = res[1];
    for (let i=1; i <= res[2].toNumber(); i += 1) {
        const delegate = {};
        const resd = await liquidPledging.getNoteDelegate(idNote, i);
        delegate.id = resd[0].toNumber();
        delegate.addr = resd[1];
        delegate.name = resd[2];
        note.delegates.push(delegate);
    }
    if (res[3].toNumber()) {
        note.proposedProject = res[3].toNumber();
        note.commmitTime = res[4].toNumber();
    }
    if (res[5].toNumber()) {
        note.oldProject = res[5].toNumber();
    }
    if (res[6].toNumber() == 0) {
        note.paymentState = "NotPaid";
    } else if (res[6].toNumber() == 1) {
        note.paymentState = "Paying";
    } else if (res[6].toNumber() == 2) {
        note.paymentState = "Paid";
    } else {
        note.paymentState = "Unknown";
    }
    return note;
};

const getManager = async (liquidPledging, idManager) => {
    const manager = {};
    const res = await liquidPledging.getNoteManager(idManager);
    if (res[0].toNumber() == 0) {
        manager.paymentState = "Donor";
    } else if (res[0].toNumber() === 1) {
        manager.paymentState = "Delegate";
    } else if (res[0].toNumber() === 2) {
        manager.paymentState = "Project";
    } else {
        manager.paymentState = "Unknown";
    }
    manager.addr = res[1];
    manager.name = res[2];
    manager.commitTime = res[3].toNumber();
    if (manager.paymentState == "Project") {
        manager.reviewer = res[4];
        manager.canceled = res[5];
    }
    return manager;
};

const getState = async (liquidPledging) => {
    const st = {
        notes: [null],
        managers: [null],
    };
    const nNotes = await liquidPledging.numberOfNotes();
    for (let i=1; i <= nNotes; i += 1) {
        const note = await getNote(liquidPledging, i);
        st.notes.push(note);
    }

    const nManagers = await liquidPledging.numberOfNoteManagers();
    for (let i=1; i <= nManagers; i += 1) {
        const manager = await getManager(liquidPledging, i);
        st.managers.push(manager);
    }
    return st;
};

const printState = async(liquidPledging) => {
    const st = await getState(liquidPledging);
    console.log(JSON.stringify(st, null, 2));
};

const printBalances = async(liquidPledging) => {
    const st = await getState(liquidPledging);
    assert.equal(st.notes.length, 13);
    for (let i=1; i<=12; i++) {
        console.log(i, web3.fromWei(st.notes[ i ].amount).toNumber() )
    }
};


contract("LiquidPledging", (accounts) => {
    let liquidPledging;
    let vault;
    let donor1 = accounts[1];
    let delegate1 = accounts[2];
    let adminProject1 = accounts[3];
    let adminProject2 = accounts[4];
    let adminProject2a = accounts[5];
    let delegate2 = accounts[6];
    let reviewer = accounts[7];
    it("Should deploy LiquidPledgin contract", async () => {
        vault = await Vault.new();
        liquidPledging = await LiquidPledging.new(vault.address);
        await vault.setLiquidPledging(liquidPledging.address);
    });
    it("Should create a donor", async () => {
        await liquidPledging.addDonor("Donor1", 86400, {from: donor1});
        const nManagers = await liquidPledging.numberOfNoteManagers();
        assert.equal(nManagers, 1);
        const res = await liquidPledging.getNoteManager(1);
        assert.equal(res[0],  0); // Donor
        assert.equal(res[1],  donor1);
        assert.equal(res[2],  "Donor1");
        assert.equal(res[3],  86400);
    });
    it("Should make a donation", async () => {
        await liquidPledging.donate(1, 1, {from: donor1, value: web3.toWei(1)});
        const nNotes = await liquidPledging.numberOfNotes();
        assert.equal(nNotes.toNumber(), 1);
        const res = await liquidPledging.getNote(1);
    });
    it("Should create a delegate", async () => {
        await liquidPledging.addDelegate("Delegate1", {from: delegate1});
        const nManagers = await liquidPledging.numberOfNoteManagers();
        assert.equal(nManagers, 2);
        const res = await liquidPledging.getNoteManager(2);
        assert.equal(res[0],  1); // Donor
        assert.equal(res[1],  delegate1);
        assert.equal(res[2],  "Delegate1");
    });
    it("Donor should delegate on the delegate ", async () => {
        await liquidPledging.transfer(1, 1, web3.toWei(0.5), 2, {from: donor1});
        const nNotes = await liquidPledging.numberOfNotes();
        assert.equal(nNotes.toNumber(), 2);
        const res1 = await liquidPledging.getNote(1);
        assert.equal(res1[0].toNumber(), web3.toWei(0.5));
        const res2 = await liquidPledging.getNote(2);
        assert.equal(res2[0].toNumber(), web3.toWei(0.5));
        assert.equal(res2[1].toNumber(), 1); // One delegate

        const d = await liquidPledging.getNoteDelegate(2, 1);
        assert.equal(d[0], 2);
        assert.equal(d[1], delegate1);
        assert.equal(d[2], "Delegate1");
    });
    it("Should create a 2 projects", async () => {
        await liquidPledging.addProject("Project1", reviewer, 86400, {from: adminProject1});

        const nManagers = await liquidPledging.numberOfNoteManagers();
        assert.equal(nManagers, 3);
        const res = await liquidPledging.getNoteManager(3);
        assert.equal(res[0],  2); // Project type
        assert.equal(res[1],  adminProject1);
        assert.equal(res[2],  "Project1");
        assert.equal(res[3],  86400);
        assert.equal(res[4],  reviewer);
        assert.equal(res[5],  false);

        await liquidPledging.addProject("Project2", reviewer, 86400, {from: adminProject2});

        const nManagers2 = await liquidPledging.numberOfNoteManagers();
        assert.equal(nManagers2, 4);
        const res4 = await liquidPledging.getNoteManager(4);
        assert.equal(res4[0],  2); // Project type
        assert.equal(res4[1],  adminProject2);
        assert.equal(res4[2],  "Project2");
        assert.equal(res4[3],  86400);
        assert.equal(res4[4],  reviewer);
        assert.equal(res4[5],  false);
    });
    it("Delegate should assign to project1", async () => {
        const n = Math.floor(new Date().getTime() / 1000);
        await liquidPledging.transfer(2, 2, web3.toWei(0.2), 3, {from: delegate1});
        const nNotes = await liquidPledging.numberOfNotes();
        assert.equal(nNotes.toNumber(), 3);
        const res3 = await liquidPledging.getNote(3);
        assert.equal(res3[0].toNumber(), web3.toWei(0.2));
        assert.equal(res3[1].toNumber(), 1); // Owner
        assert.equal(res3[2].toNumber(), 1); // Delegates
        assert.equal(res3[3].toNumber(), 3); // Proposed Project
        assert.isAbove(res3[4], n + 86000);
        assert.equal(res3[5].toNumber(), 0); // Old Node
        assert.equal(res3[6].toNumber(), 0); // Not Paid
    });
    it("Donor should change his mind and assign half of it to project2", async () => {
        const n = Math.floor(new Date().getTime() / 1000);
        await liquidPledging.transfer(1, 3, web3.toWei(0.1), 4, {from: donor1});
        const nNotes = await liquidPledging.numberOfNotes();
        assert.equal(nNotes.toNumber(), 4);
        const res3 = await liquidPledging.getNote(3);
        assert.equal(res3[0].toNumber(), web3.toWei(0.1));
        const res4 = await liquidPledging.getNote(4);
        assert.equal(res4[1].toNumber(), 4); // Owner
        assert.equal(res4[2].toNumber(), 0); // Delegates
        assert.equal(res4[3].toNumber(), 0); // Proposed Project
        assert.equal(res4[4], 0);
        assert.equal(res4[5].toNumber(), 2); // Old Node
        assert.equal(res4[6].toNumber(), 0); // Not Paid
    });
    it("After the time, the project1 should be able to spend part of it", async () => {
        const n = Math.floor(new Date().getTime() / 1000);
        await liquidPledging.setMockedTime(n + 86401);
        await liquidPledging.withdraw(3, web3.toWei(0.05), {from: adminProject1});
        const nNotes = await liquidPledging.numberOfNotes();
        assert.equal(nNotes.toNumber(), 6);
        const res5 = await liquidPledging.getNote(5);
        assert.equal(res5[0].toNumber(), web3.toWei(0.05));
        assert.equal(res5[1].toNumber(), 3); // Owner
        assert.equal(res5[2].toNumber(), 0); // Delegates
        assert.equal(res5[3].toNumber(), 0); // Proposed Project
        assert.equal(res5[4], 0);            // commit time
        assert.equal(res5[5].toNumber(), 2); // Old Node
        assert.equal(res5[6].toNumber(), 0); // Not Paid
        const res6 = await liquidPledging.getNote(6);
        assert.equal(res6[0].toNumber(), web3.toWei(0.05));
        assert.equal(res6[1].toNumber(), 3); // Owner
        assert.equal(res6[2].toNumber(), 0); // Delegates
        assert.equal(res6[3].toNumber(), 0); // Proposed Project
        assert.equal(res6[4], 0);            // commit time
        assert.equal(res6[5].toNumber(), 2); // Old Node
        assert.equal(res6[6].toNumber(), 1); // Peinding paid Paid
    });
    it("Should collect the Ether", async () => {
        const initialBalance = await web3.eth.getBalance(adminProject1);

        await vault.confirmPayment(0);
        const finalBalance = await web3.eth.getBalance(adminProject1);

        const collected = web3.fromWei(finalBalance.sub(initialBalance)).toNumber();

        assert.equal(collected, 0.05);

        const nNotes = await liquidPledging.numberOfNotes();
        assert.equal(nNotes.toNumber(), 7);
        const res7 = await liquidPledging.getNote(7);
        assert.equal(res7[0].toNumber(), web3.toWei(0.05));
        assert.equal(res7[1].toNumber(), 3); // Owner
        assert.equal(res7[2].toNumber(), 0); // Delegates
        assert.equal(res7[3].toNumber(), 0); // Proposed Project
        assert.equal(res7[4], 0);            // commit time
        assert.equal(res7[5].toNumber(), 2); // Old Node
        assert.equal(res7[6].toNumber(), 2); // Peinding paid Paid
    });
    it("Reviewer should be able to cancel project1", async () => {
        await liquidPledging.cancelProject(3, {from: reviewer});
        const st = await getState(liquidPledging);
        assert.equal(st.managers[3].canceled , true);
    });
    it("Should not allow to withdraw from a canceled project", async () => {
        const st = await getState(liquidPledging);
        assert.equal(web3.fromWei(st.notes[5].amount).toNumber(), 0.05);
        await assertFail(async function() {
            await liquidPledging.withdraw(5, web3.toWei(0.01), {from: adminProject1});
        });
    });
    it("Delegate should send part of this ETH to project2", async () => {
        await liquidPledging.transfer(2, 5, web3.toWei(0.03), 4, {from: delegate1});
        const st = await getState(liquidPledging);
        assert.equal(st.notes.length, 9);
        assert.equal(web3.fromWei(st.notes[ 8 ].amount).toNumber(), 0.03);
        assert.equal(st.notes[8].owner, 1);
        assert.equal(st.notes[8].delegates.length, 1);
        assert.equal(st.notes[8].delegates[0].id, 2);
        assert.equal(st.notes[8].proposedProject, 4);
    });
    it("Donor should be able to send the remaining to project2", async () => {
        await liquidPledging.transfer(1, 5, web3.toWei(0.02), 4, {from: donor1});
        const st = await getState(liquidPledging);
        assert.equal(st.notes.length, 9);
        assert.equal(web3.fromWei(st.notes[ 5 ].amount).toNumber(), 0);
        assert.equal(web3.fromWei(st.notes[ 4 ].amount).toNumber(), 0.12);
    });
    it("A subproject 2a and a delegate2 is created", async () => {
        await liquidPledging.addProject("Project2a", reviewer, 86400, {from: adminProject2a});
        await liquidPledging.addDelegate("Delegate2", {from: delegate2});
        const nManagers = await liquidPledging.numberOfNoteManagers();
        assert.equal(nManagers, 6);
    });
    it("Project 2 delegate in delegate2", async () => {
        await liquidPledging.transfer(4, 4, web3.toWei(0.02), 6, {from: adminProject2});
        const st = await getState(liquidPledging);
        assert.equal(st.notes.length, 10);
        assert.equal(web3.fromWei(st.notes[ 9 ].amount).toNumber(), 0.02);
        assert.equal(web3.fromWei(st.notes[ 4 ].amount).toNumber(), 0.1);
    });
    it("delegate2 assigns to projec2a", async () => {
        await liquidPledging.transfer(6, 9, web3.toWei(0.01), 5, {from: delegate2});
        const st = await getState(liquidPledging);
        assert.equal(st.notes.length, 11);
        assert.equal(web3.fromWei(st.notes[ 9 ].amount).toNumber(), 0.01);
        assert.equal(web3.fromWei(st.notes[ 10 ].amount).toNumber(), 0.01);
    });
    it("project2a authorize to spend a little", async () => {
        const n = Math.floor(new Date().getTime() / 1000);
        await liquidPledging.setMockedTime(n + 86401*3);
        await liquidPledging.withdraw(10, web3.toWei(0.005), {from: adminProject2a});
        const st = await getState(liquidPledging);
        assert.equal(st.notes.length, 13);
        assert.equal(web3.fromWei(st.notes[ 10 ].amount).toNumber(), 0);
        assert.equal(web3.fromWei(st.notes[ 11 ].amount).toNumber(), 0.005);
        assert.equal(web3.fromWei(st.notes[ 12 ].amount).toNumber(), 0.005);
    });
    it("project2 is canceled", async () => {
        await liquidPledging.cancelProject(4, {from: reviewer});
    });
    it("project2 should not be able to confirm payment", async () => {
        await assertFail(async function() {
            await vault.confirmPayment(1);
        });
    });
    it("Should not be able to withdraw it", async() => {
        await assertFail(async function() {
            await liquidPledging.withdraw(12, web3.toWei(0.005), {from: donor1});
        });
    });
    it("Should not be able to cancel payment", async() => {
        await vault.cancelPayment(1);
        const st = await getState(liquidPledging);
        assert.equal(st.notes.length, 13);
        assert.equal(web3.fromWei(st.notes[ 2 ].amount).toNumber(), 0.31);
        assert.equal(web3.fromWei(st.notes[ 11 ].amount).toNumber(), 0);
        assert.equal(web3.fromWei(st.notes[ 12 ].amount).toNumber(), 0);
    });
    it("original owner should recover the remaining funds", async () => {
        const st = await getState(liquidPledging);

        await liquidPledging.withdraw(1, web3.toWei(0.5), {from: donor1});
        await liquidPledging.withdraw(2, web3.toWei(0.31), {from: donor1});
        await liquidPledging.withdraw(4, web3.toWei(0.1), {from: donor1});

        await liquidPledging.withdraw(8, web3.toWei(0.03), {from: donor1});
        await liquidPledging.withdraw(9, web3.toWei(0.01), {from: donor1});

        const initialBalance = await web3.eth.getBalance(donor1);
        await vault.multiConfirm([2,3,4,5,6]);

        const finalBalance = await web3.eth.getBalance(donor1);
        const collected = web3.fromWei(finalBalance.sub(initialBalance)).toNumber();

        assert.equal(collected, 0.95);
    });

});

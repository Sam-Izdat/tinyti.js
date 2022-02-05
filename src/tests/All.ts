
import { error , log} from "../utils/Logging"
import {testSimple} from "./TestSimple"
import {testCopyFieldToHost1D} from "./TestCopyFieldToHost1D"
import {test2DField} from "./Test2DField"
import {testLocalVar} from "./testLocalVar"
import {testVector} from "./TestVector"
import {testMatrix} from "./TestMatrix"


async function runAllTests() {
    let passed = true
    passed &&= await testSimple()
    passed &&= await testCopyFieldToHost1D()
    passed &&= await test2DField()
    passed &&= await testLocalVar()
    passed &&= await testVector()
    passed &&= await testMatrix()

    if(passed){
        console.log("All tests passed")
    }
    else{
        error("TESTS FAILED")
    }
}


export {runAllTests}